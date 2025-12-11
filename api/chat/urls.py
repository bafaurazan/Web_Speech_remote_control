from django.urls import path
from . import views

urlpatterns = [
    # 1. TO MUSISZ DODAĆ (Przywracamy stronę główną):
    path('', views.index_view, name='index'),

    # 2. Twoje endpointy API (bez zmian):
    path('api/generate/', views.api_generate_view, name='api_generate'),
    path('api/rag/', views.rag_pipeline_view, name='rag_pipeline'),
]