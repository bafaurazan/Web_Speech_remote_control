from django.urls import path
from .views import main_view, api_generate_view, api_generate_audio

urlpatterns = [
    path('', main_view, name='main_view'),
    path('api/generate', api_generate_view, name='api_generate_view'),  # Dodanie endpointu POST
    path('api/generate_audio', api_generate_audio, name='api_generate_audio'),
]
