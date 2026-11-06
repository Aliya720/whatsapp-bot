from celery import Celery
from .config import settings

celery_app = Celery(
    "whatsapp_bot",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.task_routes = {
    'personal.*': {'queue': 'personal_messages'},
    'professional.*': {'queue': 'professional_messages'},
}

celery_app.conf.imports = ('tasks.personal', 'tasks.professional')
