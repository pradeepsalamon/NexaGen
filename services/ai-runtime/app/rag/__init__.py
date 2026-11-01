"""RAG building blocks (docs/ai/architecture/AI_FOUNDATION.md §5).

Pure Python with no dependency beyond the standard library, so they can serve
the runtime's future /v1/documents/prepare and the NestJS-side checks alike.
The RAG proof of concept (eval/rag_poc/, RAG_POC.md) is their first user;
nothing here is reachable over HTTP yet."""
