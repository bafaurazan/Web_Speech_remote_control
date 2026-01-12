from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import render
import requests

# === WAŻNE IMPORTY (Bez nich będzie błąd 500) ===
from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
# ================================================

# from static.js.nlp.nlpModules.ragPipeline import ragPipeline (zakomentowane jak w oryginale)

def ragPipeline(prompt):
    return f"Backend otrzymał prompt: '{prompt}', ale moduł RAG jest w trakcie przenoszenia."

def index_view(request):
    return render(request, 'chat/index.html')

# === WIDOK LOGOWANIA ===
@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    Logowanie użytkownika i zwracanie tokenu.
    """
    username = request.data.get("username")
    password = request.data.get("password")

    if not username or not password:
        return Response({"error": "Brak loginu lub hasła"}, status=status.HTTP_400_BAD_REQUEST)

    user = authenticate(username=username, password=password)

    if user is not None:
        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            "token": token.key,
            "username": user.username
        })
    else:
        return Response({"error": "Błędne dane logowania"}, status=status.HTTP_401_UNAUTHORIZED)
    
@api_view(['POST'])
@permission_classes([IsAuthenticated]) # Tylko dla zalogowanych
def api_generate_view(request):
    try:
        data = request.data
        external_url = "http://localhost:11434/api/generate"
        response = requests.post(
            external_url,
            headers={"Content-Type": "application/json"},
            json=data,
        )
        if response.status_code == 200:
            return Response(response.json(), status=status.HTTP_200_OK)
        else:
            return Response(
                {"error": f"External server responded with status {response.status_code}"},
                status=response.status_code,
            )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated]) # Tylko dla zalogowanych
def rag_pipeline_view(request):
    try:
        query_text = request.data.get("prompt")
        if not query_text:
            return Response({"error": "Query text is required."}, status=status.HTTP_400_BAD_REQUEST)

        response_text = ragPipeline(query_text)
        return Response({"response": response_text}, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)