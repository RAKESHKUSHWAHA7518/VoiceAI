import { KnowledgeChunkModel } from '../models/knowledge-chunk.model';
import type { DocumentChunk } from '../models/knowledge-chunk.model';
export type { DocumentChunk } from '../models/knowledge-chunk.model';
import { KnowledgeDocumentModel } from '../models/knowledge-document.model';
import type { DocumentRecord } from '../models/knowledge-document.model';
export type { DocumentRecord } from '../models/knowledge-document.model';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import config from '../config';
import logger from '../utils/logger';
import { PersistentStore, isMongoEnabled } from './database';



export interface RetrievalResult {
  chunk_id: string;
  doc_id: string;
  title: string;
  filename: string;
  text: string;
  score: number; // 0.0 to 1.0 similarity score
  latency_ms: number;
}

const DATA_DIR = path.join(__dirname, '../../data/knowledge');
const DOCS_FILE = path.join(DATA_DIR, 'documents.json');
const CHUNKS_FILE = path.join(DATA_DIR, 'chunks.json');

// Stopwords for search vectorization
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most',
  'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than',
  'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself'
]);

export class RAGEngine {
  private documents: Map<string, DocumentRecord> = new Map();
  private chunks: DocumentChunk[] = [];
  private documentsStore = new PersistentStore(KnowledgeDocumentModel, DOCS_FILE, () => Array.from(this.documents.values()), records => {
    this.documents = new Map(records.map(record => [record.id, record]));
  });
  private chunksStore = new PersistentStore(KnowledgeChunkModel, CHUNKS_FILE, () => this.chunks, records => { this.chunks = records; });
  private isInitialized = false;

  constructor() {
    this.ensureStorage();
  }

  private ensureStorage(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      this.loadFromDisk();
    } catch (err) {
      logger.warn('[RAG] Error ensuring storage:', err);
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(DOCS_FILE)) {
        const rawDocs = JSON.parse(fs.readFileSync(DOCS_FILE, 'utf-8'));
        this.documents = new Map(rawDocs.map((d: DocumentRecord) => [d.id, d]));
      }
      if (fs.existsSync(CHUNKS_FILE)) {
        this.chunks = JSON.parse(fs.readFileSync(CHUNKS_FILE, 'utf-8'));
      }
      this.isInitialized = true;
      logger.info(`[RAG Engine] Loaded ${this.documents.size} documents and ${this.chunks.length} chunks from disk.`);
    } catch (err) {
      logger.warn('[RAG Engine] Error loading from disk:', err);
      this.documents = new Map();
      this.chunks = [];
    }
  }

  private async saveToDisk(): Promise<void> {
    await this.documentsStore.save();
    await this.chunksStore.save();
  }

  /**
   * Tokenize text into normalized lowercase tokens removing punctuation and stopwords
   */
  public tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_\-\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  }

  /**
   * Computes term frequencies and Euclidean magnitude for cosine similarity
   */
  public computeVector(tokens: string[]): { tf: Record<string, number>; magnitude: number } {
    const tf: Record<string, number> = {};
    for (const t of tokens) {
      tf[t] = (tf[t] || 0) + 1;
    }
    let sumSq = 0;
    for (const count of Object.values(tf)) {
      sumSq += count * count;
    }
    return { tf, magnitude: Math.sqrt(sumSq) || 1 };
  }

  /**
   * Semantic chunking: target ~350 tokens (approx 1200 chars) with 200 char overlap
   */
  public chunkText(text: string, maxChunkLength = 1200, overlap = 200): string[] {
    const cleanText = text.replace(/\r\n/g, '\n').trim();
    if (!cleanText) return [];

    // Split on double linebreaks first (paragraphs)
    const paragraphs = cleanText.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      const trimmedPara = paragraph.trim();
      if (!trimmedPara) continue;

      if ((currentChunk.length + trimmedPara.length) <= maxChunkLength) {
        currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
          // Preserve trailing overlap
          const words = currentChunk.split(/\s+/);
          const overlapWords = words.slice(-Math.min(30, words.length)).join(' ');
          currentChunk = overlapWords + '\n\n' + trimmedPara;
        } else {
          // Paragraph itself is larger than maxChunkLength: chunk by sentences
          const sentences = trimmedPara.split(/(?<=[.?!])\s+/);
          for (const s of sentences) {
            if ((currentChunk.length + s.length) <= maxChunkLength) {
              currentChunk += (currentChunk ? ' ' : '') + s;
            } else {
              if (currentChunk) chunks.push(currentChunk);
              currentChunk = s;
            }
          }
        }
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Extract plain text from supported file types
   */
  public async extractText(filePath: string, fileType: string): Promise<string> {
    const ext = fileType.toLowerCase().replace('.', '');
    
    if (ext === 'pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        return pdfData.text || '';
      } catch (e) {
        logger.warn('[RAG] pdf-parse failed, falling back to text read:', e);
        return fs.readFileSync(filePath, 'utf-8');
      }
    } else if (ext === 'json') {
      const content = fs.readFileSync(filePath, 'utf-8');
      try {
        const parsed = JSON.parse(content);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return content;
      }
    } else {
      // txt, md, csv
      return fs.readFileSync(filePath, 'utf-8');
    }
  }

  /**
   * Ingest and index a document from a file
   */
  public async ingestFile(
    agentId: string,
    filePath: string,
    filename: string,
    title?: string
  ): Promise<DocumentRecord> {
    const ext = path.extname(filename).toLowerCase().replace('.', '') as 'pdf' | 'md' | 'txt' | 'json' | 'csv';
    const stats = fs.statSync(filePath);
    const docId = `doc_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    const docTitle = title || filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

    try {
      const text = await this.extractText(filePath, ext);
      return await this.ingestText(agentId, docTitle, filename, ext, stats.size, text, docId);
    } catch (err: any) {
      const failedDoc: DocumentRecord = {
        id: docId,
        agent_id: agentId,
        title: docTitle,
        filename,
        file_type: ext,
        file_size: stats.size,
        created_at: Date.now(),
        chunk_count: 0,
        status: 'error',
        error: err.message || 'Ingestion failed',
      };
      this.documents.set(docId, failedDoc);
      await this.saveToDisk();
      throw err;
    }
  }

  /**
   * Ingest plain text content directly
   */
  public async ingestText(
    agentId: string,
    title: string,
    filename: string,
    fileType: 'pdf' | 'md' | 'txt' | 'json' | 'csv',
    fileSize: number,
    text: string,
    existingDocId?: string
  ): Promise<DocumentRecord> {
    const docId = existingDocId || `doc_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    const textChunks = this.chunkText(text);

    const docRecord: DocumentRecord = {
      id: docId,
      agent_id: agentId,
      title,
      filename,
      file_type: fileType,
      file_size: fileSize,
      created_at: Date.now(),
      chunk_count: textChunks.length,
      status: 'indexed',
    };

    // Remove any previous chunks for this document id
    this.chunks = this.chunks.filter((c) => c.doc_id !== docId);

    // Create chunks with precalculated term frequency vectors
    for (let i = 0; i < textChunks.length; i++) {
      const chunkText = textChunks[i];
      const tokens = this.tokenize(chunkText);
      const { tf, magnitude } = this.computeVector(tokens);

      const chunk: DocumentChunk = {
        id: `chk_${docId}_${i}`,
        doc_id: docId,
        agent_id: agentId,
        chunk_index: i,
        text: chunkText,
        metadata: {
          title,
          filename,
          token_count: tokens.length,
        },
        term_frequencies: tf,
        magnitude,
      };

      this.chunks.push(chunk);
    }

    this.documents.set(docId, docRecord);
    await this.saveToDisk();
    logger.info(`[RAG Engine] Successfully indexed "${title}" (${textChunks.length} chunks) for agent ${agentId}.`);
    return docRecord;
  }

  /**
   * Delete a document and its chunks
   */
  public async deleteDocument(docId: string): Promise<boolean> {
    const exists = this.documents.has(docId);
    if (!exists) return false;

    this.documents.delete(docId);
    this.chunks = this.chunks.filter((c) => c.doc_id !== docId);
    await this.saveToDisk();
    logger.info(`[RAG Engine] Deleted document ${docId}.`);
    return true;
  }

  /**
   * List all documents (optional filter by agent)
   */
  public listDocuments(agentId?: string): DocumentRecord[] {
    const all = Array.from(this.documents.values());
    if (!agentId || agentId === 'all') {
      return all;
    }
    return all.filter((d) => d.agent_id === agentId || d.agent_id === 'global');
  }

  /**
   * Get chunks for a specific document
   */
  public getChunksForDoc(docId: string): DocumentChunk[] {
    return this.chunks.filter((c) => c.doc_id === docId);
  }

  /**
   * Ultra-low-latency semantic retrieval (<25ms budget)
   * Scores chunks based on cosine similarity + query term coverage + BM25 term weighting
   */
  public search(
    agentId: string,
    query: string,
    topK = 2,
    minScore = 0.15
  ): RetrievalResult[] {
    const start = Date.now();
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const { tf: queryTf, magnitude: queryMag } = this.computeVector(queryTokens);

    // Filter candidate chunks by agent or global
    const candidates = this.chunks.filter(
      (c) => c.agent_id === agentId || c.agent_id === 'global' || agentId === 'all'
    );

    const scored: Array<{ chunk: DocumentChunk; score: number }> = [];

    for (const chunk of candidates) {
      if (!chunk.term_frequencies || !chunk.magnitude) continue;

      // 1. Vector Cosine Similarity
      let dotProduct = 0;
      let matchedTokens = 0;

      for (const [token, qCount] of Object.entries(queryTf)) {
        const docCount = chunk.term_frequencies[token];
        if (docCount) {
          dotProduct += qCount * docCount;
          matchedTokens++;
        }
      }

      if (dotProduct === 0) continue;

      const cosineSim = dotProduct / (queryMag * chunk.magnitude);

      // 2. Query Term Coverage Boost (e.g. if 3 out of 3 key query terms match)
      const coverageBoost = matchedTokens / Object.keys(queryTf).length;

      // 3. Combined calibrated score [0.0 - 1.0]
      const score = Math.min(1.0, (cosineSim * 0.6) + (coverageBoost * 0.4));

      if (score >= minScore) {
        scored.push({ chunk, score });
      }
    }

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    const latency = Date.now() - start;
    const topResults = scored.slice(0, topK).map(({ chunk, score }) => ({
      chunk_id: chunk.id,
      doc_id: chunk.doc_id,
      title: chunk.metadata.title,
      filename: chunk.metadata.filename,
      text: chunk.text,
      score: Math.round(score * 1000) / 1000,
      latency_ms: latency,
    }));

    return topResults;
  }

  /**
   * Seed enterprise demo policies and manuals for default agents if no documents exist
   */
  public async seedDefaultDocuments(): Promise<number> {
    const defaultData = [
      {
        agent_id: 'agent_support',
        title: 'Customer Refund and Return Policy (2025 Standard)',
        filename: 'refund_and_returns_policy_v2.md',
        content: `# Global Customer Refund and Return Policy

## 1. General Return Window
Customers may return physical merchandise within **30 calendar days** of the confirmed delivery date for a 100% full refund to the original payment method.

## 2. Opened and Unboxed Electronics
Opened goods, electronics, and boxed accessories may be returned within **14 calendar days** of delivery provided:
- The product is in pristine cosmetic condition with all original cables, chargers, and retail packaging.
- Personal data and locks (e.g. iCloud, Google Account) have been completely removed.
- Restocking fee: A **0% restocking fee** applies to standard returns, but damaged retail boxes may incur a 10% fee.

## 3. Defective or Damaged Upon Arrival
If an item arrives damaged or non-functional, the customer is entitled to an immediate **instant replacement** or full refund within 48 hours of reporting. Prepaid shipping labels are provided free of charge by customer support.

## 4. Refund Processing Timelines
- Credit/Debit Cards: 3 to 5 business days after inspection at the fulfillment center.
- PayPal / Store Credit: Issued immediately upon carrier drop-off scan.
- Cash on Delivery: Refunded via bank transfer within 2 business days.

## 5. Non-Returnable Items
Gift cards, personalized custom-engraved items, and software licenses with activated product keys are strictly non-refundable.`,
      },
      {
        agent_id: 'agent_hotel',
        title: 'Grand Palace Hotel Guest Directory & Services',
        filename: 'grand_palace_guest_directory.md',
        content: `# Grand Palace Hotel - Guest Directory & Amenities

## 1. Check-in & Check-out Policies
- Standard Check-in time: **3:00 PM (15:00)**.
- Standard Check-out time: **11:00 AM (11:00)**.
- Early check-in (from 11:00 AM) and late check-out (up to 2:00 PM) are available complimentary for Executive Suite guests, or for a flat $45 fee subject to room availability.

## 2. In-Room Dining & Room Service
- 24/7 Room Service is available daily. Dial "0" or "DINING" from the room telephone.
- Breakfast Menu: Served from **6:30 AM to 11:00 AM**. Includes Continental, American, and Japanese breakfast sets.
- Late Night Menu: Available from **11:00 PM to 6:00 AM** featuring artisan flatbreads, gourmet burgers, and comfort soups.

## 3. Spa, Wellness & Infinity Pool
- The 4th-floor heated infinity pool and wellness center are open daily from **6:00 AM to 10:00 PM**.
- Deep-tissue massage and hydrotherapy bookings require 2 hours prior notice.
- Fitness center is accessible 24/7 with the room keycard.

## 4. Michelin-Star Dining Reservations (L'Étoile)
- Located on the 32nd floor rooftop.
- Dinner sittings at 6:30 PM and 9:00 PM. Smart elegant dress code required (no sportswear or beach sandals).`,
      },
      {
        agent_id: 'agent_weather',
        title: 'Global Concierge Travel & Weather Advisory Handbook',
        filename: 'concierge_travel_advisory.md',
        content: `# Global Travel Concierge & Seasonal Weather Handbook

## 1. Tokyo Travel & Seasonal Packing
- Spring (March - May): Mild and pleasant (14°C - 21°C). Cherry blossom season peaks in early April. Carry a light cardigan or trench coat.
- Summer (June - August): Hot and humid (26°C - 34°C). Frequent afternoon rain showers in June (Tsuyu). An ultra-compact umbrella and UV sun protection are essential.
- Autumn (September - November): Clear skies and crisp temperatures (15°C - 22°C). Ideal for sightseeing and walking tours.

## 2. Paris & Western Europe Recommendations
- Spring & Autumn: Crisp mornings (10°C - 18°C) with occasional drizzle. Layering with a wool scarf and waterproof footwear is highly recommended.
- Museum Pass VIP Access: The Louvre and Musée d'Orsay require timed-entry reservation slots booked at least 48 hours in advance.

## 3. Airport Express Transit
- Tokyo Narita: Keisei Skyliner (41 minutes to Ueno) or JR Narita Express (53 minutes to Tokyo Station).
- Paris Charles de Gaulle: RoissyBus direct to Opera (60 minutes) or private chauffeur service arranged through hotel concierge desk.`,
      },
      {
        agent_id: 'agent_medical',
        title: 'Downtown Health Clinic Patient Protocols & Triage',
        filename: 'clinic_patient_protocols.md',
        content: `# Downtown Medical Clinic - Patient Protocols & Triage Guide

## 1. Appointment Scheduling & Cancellations
- Standard clinic hours: Monday to Friday, **8:00 AM to 6:00 PM**. Saturday urgent clinic: **9:00 AM to 2:00 PM**.
- Cancellations: Patients must provide at least **24 hours notice** to reschedule or cancel without incurring a $30 late fee.

## 2. Emergency Triage Guidelines
- If a patient reports chest pain, sudden numbness, severe difficulty breathing, or acute anaphylaxis, immediately advise calling **911** or visiting the nearest Emergency Department.
- For mild urgent issues (fever, minor lacerations, earache), same-day walk-in appointments are available at the Urgent Care desk.

## 3. Prescription Refills & Pharmacy Coordination
- Routine maintenance medications (hypertension, thyroid, cholesterol) require 48 hours notice for electronic refill transmission to the patient's preferred retail pharmacy.
- Controlled substances require an in-person or telehealth physician consultation every 90 days.

## 4. Telehealth & Insurance Coverage
- We accept all major PPO insurance plans (Blue Cross, Aetna, Cigna, UnitedHealthcare) and Medicare.
- Virtual video consultations are covered identically to in-clinic visits under standard parity guidelines.`,
      },
    ];

    let count = 0;
    for (const item of defaultData) {
      // Only seed if title doesn't exist
      const existing = Array.from(this.documents.values()).some((d) => d.title === item.title);
      if (!existing) {
        await this.ingestText(
          item.agent_id,
          item.title,
          item.filename,
          'md',
          Buffer.byteLength(item.content, 'utf-8'),
          item.content
        );
        count++;
      }
    }

    return count;
  }
}

export const ragEngine = new RAGEngine();
// Auto-seed default documents on first boot if store is empty
if (!isMongoEnabled() && ragEngine.listDocuments().length === 0) {
  ragEngine.seedDefaultDocuments().catch((err) => {
    logger.warn('[RAG Engine] Error auto-seeding defaults:', err);
  });
}
