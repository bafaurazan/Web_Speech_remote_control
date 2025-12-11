from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import render
import requests
import json

# Import the RAG pipeline functions
# Upewnij się, że ta ścieżka importu jest poprawna w Pythonie.
# Zwykle importowanie z folderu 'static' jest niestandardowe, 
# ale zostawiam to tak jak masz, zakładając, że działa.
from static.js.nlp.nlpModules.ragPipeline import ragPipeline

def index_view(request):
    """
    Wyświetla stronę startową API z dokumentacją html.
    """
    return render(request, 'chat/index.html')

@api_view(['POST'])
def api_generate_view(request):
    """
    Endpoint proxy do Ollama/LLM.
    Oczekuje JSON w body requestu.
    """
    try:
        # DRF automatycznie parsuje JSON do request.data
        data = request.data
        external_url = "http://localhost:11434/api/generate"

        # Wyślij dane do zewnętrznego endpointu
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
def rag_pipeline_view(request):
    """
    Handle POST requests to query the RAG pipeline.
    
    Request format (JSON):
    {
        "model": "wsrc_nlp",
        "prompt": "Jedź do tyłu przez 5 sekund",
        "stream": false
    }
    """
    try:
        query_text = request.data.get("prompt")

        if not query_text:
            return Response({"error": "Query text is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Call the RAG pipeline
        response_text = ragPipeline(query_text)

        return Response({"response": response_text}, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)