from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render
from django.http import JsonResponse
import json
import requests

# Główna strona
def main_view(request):
    context = {}
    return render(request, 'chat/main.html', context=context)


# Funkcja obsługująca POST na endpoint /api/generate
@csrf_exempt
def api_generate_view(request):
    if request.method == "POST":
        try:
            # Pobranie danych przesłanych w żądaniu POST
            data = json.loads(request.body)  # Parsowanie JSON z ciała żądania
            # Zdefiniowanie endpointu, na który dane będą wysyłane
            external_url = "http://localhost:11434/api/generate"

            # Wyślij dane za pomocą metody POST do zewnętrznego endpointu
            response = requests.post(
                external_url,
                headers={"Content-Type": "application/json"},
                json=data,  # Automatyczne serializowanie JSON
            )

            # Sprawdzenie odpowiedzi i zwrócenie jej użytkownikowi
            if response.status_code == 200:
                return JsonResponse(response.json())
            else:
                return JsonResponse(
                    {"error": f"External server responded with status {response.status_code}"},
                    status=response.status_code,
                )
        except Exception as e:
            # Obsługa wyjątków i zwrócenie błędu
            return JsonResponse({"error": str(e)}, status=500)

    # Jeśli metoda nie jest POST, zwróć błąd
    return JsonResponse({"error": "Invalid request method"}, status=400)


# Import the RAG pipeline functions
from static.js.nlp.nlpModules.ragPipeline import ragPipeline

@csrf_exempt
def rag_pipeline_view(request):
    """
    Handle POST requests to query the RAG pipeline.

    Request format (JSON):
    {
    "model": "wsrc_nlp",
    "prompt": "Jedź do tyłu przez 5 sekund",
    "stream": false
    }

    Response format (JSON):
    {
        "response": "Generated response from the RAG pipeline"
    }
    """
    if request.method == "POST":
        try:
            # Parse the incoming JSON request
            data = json.loads(request.body)
            query_text = data.get("prompt")

            if not query_text:
                return JsonResponse({"error": "Query text is required."}, status=400)

            # Call the RAG pipeline
            response = ragPipeline(query_text)

            return JsonResponse({"response": response})
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)
    else:
        return JsonResponse({"error": "Invalid request method"}, status=405)
