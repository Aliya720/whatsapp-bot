import requests
import uuid
import time
import sys

BASE_URL = "http://localhost:8080/api"

def wait_for_backend():
    print("Waiting for backend...")
    for _ in range(30):
        try:
            res = requests.get(f"{BASE_URL}/health")
            if res.status_code == 200:
                print("Backend is up!")
                return
        except Exception:
            pass
        time.sleep(2)
    print("Backend failed to start.")
    sys.exit(1)

def test_auth_and_isolation():
    # 1. Register User A (Org A)
    user_a_email = f"user_a_{uuid.uuid4().hex[:6]}@test.com"
    res_a = requests.post(f"{BASE_URL}/auth/register", json={
        "email": user_a_email,
        "password": "Password123!",
        "company_name": "Org A"
    })
    assert res_a.status_code == 200, f"Register A failed: {res_a.text}"

    # 2. Login User A
    res_a_login = requests.post(f"{BASE_URL}/auth/login", data={
        "username": user_a_email,
        "password": "Password123!"
    })
    token_a = res_a_login.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    res_recip = requests.post(f"{BASE_URL}/recipients/", headers=headers_a, json={
        "phone_number": "+14155552671",
        "first_name": "Test",
        "last_name": "User"
    })
    assert res_recip.status_code == 200, f"Recipient failed: {res_recip.text}"
    recip_id = res_recip.json()["id"]

    # 3. Create Campaign A
    res_camp_a = requests.post(f"{BASE_URL}/campaigns/", headers=headers_a, json={
        "name": "Campaign A",
        "mode": "personal",
        "message_template": "Hello!",
        "recipient_ids": [recip_id]
    })
    assert res_camp_a.status_code == 200, f"Campaign creation failed: {res_camp_a.status_code} - {res_camp_a.text}"
    camp_a_id = res_camp_a.json()["id"]

    # 4. Register User B (Org B)
    user_b_email = f"user_b_{uuid.uuid4().hex[:6]}@test.com"
    requests.post(f"{BASE_URL}/auth/register", json={
        "email": user_b_email,
        "password": "Password123!",
        "company_name": "Org B"
    })
    res_b_login = requests.post(f"{BASE_URL}/auth/login", data={
        "username": user_b_email,
        "password": "Password123!"
    })
    token_b = res_b_login.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 5. User B tries to read Campaign A
    res_b_read_a = requests.get(f"{BASE_URL}/campaigns/{camp_a_id}", headers=headers_b)
    print(f"User B accessing Campaign A: {res_b_read_a.status_code} - {res_b_read_a.text}")
    assert res_b_read_a.status_code == 404, "Security vulnerability! Cross-tenant read allowed."

    print("Authorization and isolation test passed.")

if __name__ == "__main__":
    wait_for_backend()
    test_auth_and_isolation()

def test_worker_processing():
    user_a_email = f'user_worker_{uuid.uuid4().hex[:6]}@test.com'
    requests.post(f'{BASE_URL}/auth/register', json={
        'email': user_a_email,
        'password': 'Password123!',
        'company_name': 'Worker Org'
    })
    res_a_login = requests.post(f'{BASE_URL}/auth/login', data={'username': user_a_email, 'password': 'Password123!'})
    assert res_a_login.status_code == 200, f"Login failed: {res_a_login.text}"
    token = res_a_login.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}

    res_recip = requests.post(f'{BASE_URL}/recipients/', headers=headers, json={
        'phone_number': '+14155552671',
        'first_name': 'Worker',
        'last_name': 'Test'
    })
    recip_id = res_recip.json()['id']

    res_camp = requests.post(f'{BASE_URL}/campaigns/', headers=headers, json={
        'name': 'Worker Test Camp',
        'mode': 'personal',
        'message_template': 'Hello Worker!',
        'recipient_ids': [recip_id]
    })
    camp_id = res_camp.json()['id']

    print('Campaign created and queued automatically. Waiting for worker to process...')
    
    for _ in range(15):
        res = requests.get(f'{BASE_URL}/campaigns/', headers=headers)
        if res.status_code != 200:
            print(f"Error fetching campaigns: {res.text}")
            continue
        camps = res.json()
        camp = next((c for c in camps if c['id'] == camp_id), None)
        if not camp:
            print("Campaign not found in list")
            continue
        status = camp['status']
        print(f'Campaign status: {status}')
        if status in ['completed', 'failed']:
            print(f'Worker test passed with status: {status}')
            return
        time.sleep(2)
    print('Worker did not process campaign.')
    sys.exit(1)

test_worker_processing()

