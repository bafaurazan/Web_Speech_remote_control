from django.urls import path
from . import views

urlpatterns = [
    # Strona główna
    path('', views.index_view, name='index'),

    # Logowanie
    path('api/login/', views.login_view, name='login'),
    path('api/register/', views.register_view, name='register'),

    # Pozostałe endpointy API
    path('api/generate/', views.api_generate_view, name='api_generate'),
    path('api/rag/', views.rag_pipeline_view, name='rag_pipeline'),
]