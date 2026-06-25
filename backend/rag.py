"""
RAG module — OCBC knowledge base with FAISS + TF-IDF retrieval.

Loads markdown documents from ocbc_knowledge/, chunks them,
builds a FAISS index, and provides a retrieval tool for the agent.

No external embedding API needed — uses TF-IDF vectors (fast, local, free).
"""

import os
import json
import hashlib
from pathlib import Path
from typing import Optional

import faiss
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer


# === Configuration ===

KNOWLEDGE_DIR = Path(__file__).parent / "ocbc_knowledge"
INDEX_DIR = Path(__file__).parent / "data" / "rag_index"
CHUNK_SIZE = 500         # Characters per chunk
CHUNK_OVERLAP = 100      # Overlap between chunks
TOP_K = 5                # Number of results to retrieve


# === Document Loading ===

def load_documents() -> list[dict]:
    """Load all markdown files from the knowledge directory."""
    docs = []
    if not KNOWLEDGE_DIR.exists():
        print(f"⚠️  Knowledge directory not found: {KNOWLEDGE_DIR}")
        return docs
    
    for md_file in sorted(KNOWLEDGE_DIR.glob("*.md")):
        content = md_file.read_text(encoding="utf-8")
        docs.append({
            "source": md_file.name,
            "content": content,
        })
    
    print(f"📚 Loaded {len(docs)} documents from {KNOWLEDGE_DIR}")
    return docs


# === Chunking ===

def chunk_document(doc: dict) -> list[dict]:
    """Split a document into overlapping chunks."""
    content = doc["content"]
    source = doc["source"]
    chunks = []
    
    # Split by sections (## headers) first
    sections = content.split("\n## ")
    
    for i, section in enumerate(sections):
        # Re-add header prefix (except for the first section which has the title)
        if i > 0:
            section = "## " + section
        
        section = section.strip()
        if not section:
            continue
        
        # If section is small enough, keep as one chunk
        if len(section) <= CHUNK_SIZE:
            chunks.append({
                "text": section,
                "source": source,
                "section_index": i,
            })
        else:
            # Split large sections into overlapping chunks
            start = 0
            while start < len(section):
                end = start + CHUNK_SIZE
                chunk_text = section[start:end]
                
                # Try to break at a sentence or line boundary
                if end < len(section):
                    # Look for the last sentence boundary
                    for boundary in ["\n\n", "\n", ". ", " "]:
                        last_idx = chunk_text.rfind(boundary)
                        if last_idx > CHUNK_SIZE * 0.5:
                            chunk_text = chunk_text[:last_idx + len(boundary)]
                            end = start + last_idx + len(boundary)
                            break
                
                chunks.append({
                    "text": chunk_text.strip(),
                    "source": source,
                    "section_index": i,
                })
                start = end - CHUNK_OVERLAP
    
    return chunks


def build_chunks() -> list[dict]:
    """Load and chunk all documents."""
    docs = load_documents()
    all_chunks = []
    
    for doc in docs:
        chunks = chunk_document(doc)
        all_chunks.extend(chunks)
    
    print(f"📦 Created {len(all_chunks)} chunks from {len(docs)} documents")
    return all_chunks


# === TF-IDF Vector Store ===

class TFIDFVectorStore:
    """Lightweight vector store using TF-IDF + FAISS."""
    
    def __init__(self):
        self.vectorizer = TfidfVectorizer(
            max_features=10000,
            stop_words="english",
            ngram_range=(1, 2),  # Unigrams + bigrams
            sublinear_tf=True,
        )
        self.index: Optional[faiss.IndexFlatIP] = None
        self.chunks: list[dict] = []
        self.is_built = False
    
    def build(self, chunks: list[dict]):
        """Build the FAISS index from chunks."""
        self.chunks = chunks
        
        if not chunks:
            print("⚠️  No chunks to index")
            return
        
        # Vectorize all chunk texts
        texts = [c["text"] for c in chunks]
        tfidf_matrix = self.vectorizer.fit_transform(texts)
        
        # Convert to dense numpy array and normalize for cosine similarity
        dense_vectors = tfidf_matrix.toarray().astype("float32")
        
        # L2 normalize for cosine similarity via inner product
        norms = np.linalg.norm(dense_vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1  # Avoid division by zero
        dense_vectors = dense_vectors / norms
        
        # Build FAISS index (Inner Product = cosine similarity after normalization)
        dimension = dense_vectors.shape[1]
        self.index = faiss.IndexFlatIP(dimension)
        self.index.add(dense_vectors)
        
        self.is_built = True
        print(f"🔍 FAISS index built: {self.index.ntotal} vectors, dim={dimension}")
    
    def search(self, query: str, top_k: int = TOP_K) -> list[dict]:
        """Search the index for relevant chunks."""
        if not self.is_built or self.index is None:
            return []
        
        # Vectorize the query
        query_vec = self.vectorizer.transform([query]).toarray().astype("float32")
        
        # Normalize
        norm = np.linalg.norm(query_vec)
        if norm > 0:
            query_vec = query_vec / norm
        
        # Search
        scores, indices = self.index.search(query_vec, min(top_k, self.index.ntotal))
        
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue
            chunk = self.chunks[idx].copy()
            chunk["score"] = float(score)
            results.append(chunk)
        
        return results
    
    def save(self, path: str):
        """Save the index and chunks to disk."""
        path = Path(path)
        path.mkdir(parents=True, exist_ok=True)
        
        # Save FAISS index
        faiss.write_index(self.index, str(path / "index.faiss"))
        
        # Save chunks metadata — convert numpy types to native Python types
        serializable_chunks = []
        for c in self.chunks:
            sc = {k: (int(v) if isinstance(v, (np.integer,)) else v) for k, v in c.items()}
            serializable_chunks.append(sc)
        with open(path / "chunks.json", "w") as f:
            json.dump(serializable_chunks, f, indent=2)
        
        # Save vectorizer vocabulary — convert numpy types
        vocab = {str(k): int(v) for k, v in self.vectorizer.vocabulary_.items()}
        idf = [float(x) for x in self.vectorizer.idf_]
        with open(path / "vectorizer.json", "w") as f:
            json.dump({
                "vocabulary": vocab,
                "idf": idf,
            }, f)
        
        print(f"💾 Index saved to {path}")
    
    def load(self, path: str) -> bool:
        """Load the index and chunks from disk."""
        path = Path(path)
        
        index_file = path / "index.faiss"
        chunks_file = path / "chunks.json"
        vocab_file = path / "vectorizer.json"
        
        if not all(f.exists() for f in [index_file, chunks_file, vocab_file]):
            return False
        
        try:
            self.index = faiss.read_index(str(index_file))
            
            with open(chunks_file) as f:
                self.chunks = json.load(f)
            
            with open(vocab_file) as f:
                vocab_data = json.load(f)
            
            # Reconstruct vectorizer from saved vocabulary + IDF
            self.vectorizer = TfidfVectorizer(
                max_features=10000,
                stop_words="english",
                ngram_range=(1, 2),
                sublinear_tf=True,
            )
            # We need to set the vocabulary and IDF without calling fit()
            # by directly setting internal attributes
            self.vectorizer.vocabulary_ = vocab_data["vocabulary"]
            self.vectorizer.idf_ = np.array(vocab_data["idf"])
            # Set stop_words to 'english' so _check_stop_words_fitted doesn't fail
            self.vectorizer.stop_words_ = None
            
            self.is_built = True
            print(f"📦 Index loaded: {self.index.ntotal} vectors from {path}")
            return True
        except Exception as e:
            print(f"⚠️  Failed to load index: {e}")
            return False


# === Singleton Instance ===

_store = TFIDFVectorStore()


def get_vector_store() -> TFIDFVectorStore:
    """Get or initialize the vector store."""
    global _store
    
    if _store.is_built:
        return _store
    
    # Try loading from cache
    cache_dir = str(INDEX_DIR)
    if _store.load(cache_dir):
        return _store
    
    # Build fresh
    chunks = build_chunks()
    _store.build(chunks)
    
    # Cache for next time
    _store.save(cache_dir)
    
    return _store


def search_ocbc_knowledge(query: str, top_k: int = TOP_K) -> str:
    """Search the OCBC knowledge base for relevant information.
    
    Args:
        query: What to search for (e.g. "savings account interest rates")
        top_k: Number of results to return (default 5)
    
    Returns:
        Formatted search results with relevance scores.
    """
    store = get_vector_store()
    results = store.search(query, top_k)
    
    if not results:
        return "No relevant information found in the OCBC knowledge base."
    
    output_parts = []
    for i, result in enumerate(results, 1):
        score_pct = result["score"] * 100
        output_parts.append(
            f"--- Result {i} (from {result['source']}, relevance: {score_pct:.0f}%) ---\n"
            f"{result['text']}"
        )
    
    return "\n\n".join(output_parts)


if __name__ == "__main__":
    # Build and test the index
    store = get_vector_store()
    
    # Test queries
    test_queries = [
        "What are the interest rates for savings accounts?",
        "Which credit card gives the best cashback?",
        "How do I apply for a home loan?",
        "What promotions are available for new customers?",
        "Tell me about OCBC digital banking features",
    ]
    
    for query in test_queries:
        print(f"\n{'='*60}")
        print(f"Query: {query}")
        print(f"{'='*60}")
        results = store.search(query, top_k=2)
        for r in results:
            print(f"\n[{r['score']:.3f}] {r['source']}:")
            print(f"  {r['text'][:150]}...")
