from django.urls import path
from . import views

urlpatterns = [
    # API endpoints
    path('api/generate/', views.api_generate_view, name='api_generate'),
    path('api/rag/', views.rag_pipeline_view, name='rag_pipeline'),
    
    # Usunęliśmy ścieżkę '' (root), ponieważ nie serwujemy już HTML z Django.
    # React będzie obsługiwał stronę główną.
]