import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { ragEngine } from '../services/rag';
import { asyncHandler } from '../middleware/errorHandler';
import config from '../config';
import logger from '../utils/logger';
import { OpenAILLM } from '../services/llm';

const router = Router();

// Configure multer for file uploads
const UPLOAD_DIR = path.join(__dirname, '../../data/knowledge/uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.md', '.txt', '.json', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type ${ext}. Allowed: ${allowed.join(', ')}`));
    }
  },
});

/**
 * GET /api/knowledge/documents
 * List indexed documents (optionally filtered by ?agent_id=xxx)
 */
router.get(
  '/documents',
  asyncHandler(async (req: Request, res: Response) => {
    const agentId = (req.query.agent_id as string) || 'all';
    const docs = ragEngine.listDocuments(agentId);
    res.json({
      success: true,
      count: docs.length,
      documents: docs,
    });
  })
);

/**
 * GET /api/knowledge/documents/:docId/chunks
 * Retrieve all chunk splits for a document
 */
router.get(
  '/documents/:docId/chunks',
  asyncHandler(async (req: Request, res: Response) => {
    const { docId } = req.params;
    const chunks = ragEngine.getChunksForDoc(docId);
    res.json({
      success: true,
      doc_id: docId,
      chunk_count: chunks.length,
      chunks,
    });
  })
);

/**
 * POST /api/knowledge/documents/upload
 * Upload a document file (.pdf, .md, .txt, .json, .csv) and index it
 */
router.post(
  '/documents/upload',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { message: 'No file uploaded. Please provide a .pdf, .md, .txt, .json, or .csv file.' },
      });
    }

    const agentId = req.body.agent_id || 'global';
    const customTitle = req.body.title || req.file.originalname;

    try {
      const doc = await ragEngine.ingestFile(
        agentId,
        req.file.path,
        req.file.originalname,
        customTitle
      );

      // Clean up uploaded temp file
      try {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch (e) {
        logger.warn('Failed to delete temp upload file:', e);
      }

      res.status(201).json({
        success: true,
        message: 'Document successfully indexed into Knowledge Base',
        document: doc,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { message: err.message || 'Failed to process document' },
      });
    }
  })
);

/**
 * POST /api/knowledge/documents/text
 * Ingest document directly from text/markdown content
 */
router.post(
  '/documents/text',
  asyncHandler(async (req: Request, res: Response) => {
    const { agent_id, title, filename, content, file_type } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: { message: 'Both "title" and "content" are required' },
      });
    }

    const type = file_type || 'md';
    const fname = filename || `${title.toLowerCase().replace(/\s+/g, '_')}.${type}`;
    const size = Buffer.byteLength(content, 'utf-8');

    const doc = await ragEngine.ingestText(
      agent_id || 'global',
      title,
      fname,
      type,
      size,
      content
    );

    res.status(201).json({
      success: true,
      message: 'Text document indexed into Knowledge Base',
      document: doc,
    });
  })
);

/**
 * DELETE /api/knowledge/documents/:docId
 * Remove a document and all its chunks from the knowledge base
 */
router.delete(
  '/documents/:docId',
  asyncHandler(async (req: Request, res: Response) => {
    const { docId } = req.params;
    const deleted = await ragEngine.deleteDocument(docId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: { message: 'Document not found' },
      });
    }

    res.json({
      success: true,
      message: 'Document and associated vectors deleted successfully',
    });
  })
);

/**
 * POST /api/knowledge/test
 * Test retrieval query with latency, score, and grounded answer synthesis
 */
router.post(
  '/test',
  asyncHandler(async (req: Request, res: Response) => {
    const { agent_id, query, top_k, min_score, synthesize_answer } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'Query string is required' },
      });
    }

    const targetAgent = agent_id || 'all';
    const k = Number(top_k) || 2;
    const threshold = typeof min_score === 'number' ? min_score : 0.15;

    const startTime = Date.now();
    const results = ragEngine.search(targetAgent, query, k, threshold);
    const retrievalLatency = Date.now() - startTime;

    let synthesizedAnswer = '';

    // If matches were found and synthesis requested, generate grounded response
    if (results.length > 0 && synthesize_answer !== false) {
      const contextSnippet = results.map((r, i) => `[Source ${i + 1}: ${r.title}]\n${r.text}`).join('\n\n');
      
      if (config.apiKeys?.openai) {
        try {
          const llm = new OpenAILLM(config.apiKeys.openai, 'gpt-4o-mini', 0.2);
          const prompt = `You are a voice agent responding to a customer. Use strictly the provided Knowledge Base context to answer their inquiry warmly and concisely in 1-2 spoken sentences.
          
KNOWLEDGE BASE CONTEXT:
${contextSnippet}

CUSTOMER QUESTION:
${query}`;

          for await (const chunk of llm.streamChat([{ role: 'system', content: 'You are a concise voice agent. Ground strictly in context.' }], prompt)) {
            if (chunk.content) synthesizedAnswer += chunk.content;
          }
        } catch (e) {
          logger.warn('[RAG] OpenAI answer synthesis error, using heuristic extract:', e);
        }
      }

      if (!synthesizedAnswer) {
        // High quality heuristic extraction
        const topChunk = results[0];
        const lines = topChunk.text.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('#'));
        synthesizedAnswer = lines[0] || topChunk.text.slice(0, 180) + '...';
      }
    } else if (results.length === 0) {
      synthesizedAnswer = "I couldn't find specific documentation on that topic in our knowledge base. Would you like me to connect you with a representative?";
    }

    res.json({
      success: true,
      query,
      agent_id: targetAgent,
      retrieval_latency_ms: retrievalLatency,
      match_count: results.length,
      results,
      grounded_answer: synthesizedAnswer.trim(),
    });
  })
);

/**
 * POST /api/knowledge/seed
 * Seed / reset default enterprise knowledge bases
 */
router.post(
  '/seed',
  asyncHandler(async (req: Request, res: Response) => {
    const seededCount = await ragEngine.seedDefaultDocuments();
    const docs = ragEngine.listDocuments();
    res.json({
      success: true,
      message: `Seeded ${seededCount} enterprise documentation files`,
      total_documents: docs.length,
      documents: docs,
    });
  })
);

export default router;
