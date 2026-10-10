import { EventEmitter } from 'events';
import logger from '../utils/logger';

export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  cartesiaVoiceId: string;
  elevenLabsVoiceId: string;
  sampleGreeting: string;
  systemPromptDirective: string;
  commonKeywords: string[];
}

export interface LanguageDetectionResult {
  language: string;
  confidence: number;
  script: 'latin' | 'devanagari' | 'japanese' | 'cjk' | 'other';
  matchedKeywords: string[];
  switched: boolean;
}

export interface LanguageSwitchEvent {
  id: string;
  sessionId: string;
  fromLanguage: string;
  toLanguage: string;
  confidence: number;
  triggerText: string;
  newVoiceId: string;
  timestamp: number;
}

export interface SessionLanguageState {
  sessionId: string;
  currentLanguage: string;
  autoDetectEnabled: boolean;
  supportedLanguages: string[];
  switchCount: number;
  history: LanguageSwitchEvent[];
  lockedLanguage?: string;
}

export const SUPPORTED_LANGUAGES: Record<string, LanguageInfo> = {
  en: {
    code: 'en',
    name: 'English',
    nativeName: 'English (US)',
    flag: '🇺🇸',
    cartesiaVoiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
    sampleGreeting: "Hello! How can I assist you today?",
    systemPromptDirective: "Respond concisely in natural, conversational English.",
    commonKeywords: ['hello', 'hi', 'hey', 'please', 'thanks', 'thank you', 'help', 'order', 'call', 'account', 'cancel', 'schedule', 'appointment', 'weather', 'booking', 'good', 'morning', 'afternoon', 'yes', 'no'],
  },
  es: {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    flag: '🇪🇸',
    cartesiaVoiceId: '846d302f-514d-4250-b0ff-90807c4bbab5',
    elevenLabsVoiceId: 'XB0fDUnXU5powFXDhCwa',
    sampleGreeting: "¡Hola! ¿En qué puedo ayudarte hoy?",
    systemPromptDirective: "El llamante está hablando en español. Responde con fluidez y naturalidad en español conciso.",
    commonKeywords: ['hola', 'buenos dias', 'buenas tardes', 'gracias', 'por favor', 'ayuda', 'como estas', 'necesito', 'quiero', 'pedido', 'cuenta', 'cancelar', 'reserva', 'cita', 'hablar', 'servicio', 'clima', 'si', 'sí', 'tarjeta'],
  },
  fr: {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    flag: '🇫🇷',
    cartesiaVoiceId: 'ab0002ba-f48a-4934-bc65-0a9e701e1272',
    elevenLabsVoiceId: 'ErXwobaYiN019PkySvjV',
    sampleGreeting: "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
    systemPromptDirective: "L'appelant parle en français. Répondez couramment et naturellement en français concis.",
    commonKeywords: ['bonjour', 'salut', 'merci', 's\'il vous plait', 'sil vous plait', 'aide', 'besoin', 'je voudrais', 'commande', 'compte', 'annuler', 'rendez-vous', 'reservation', 'oui', 'non', 'comment', 'service'],
  },
  de: {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    cartesiaVoiceId: '38511746-8147-4340-9a3e-436f98993880',
    elevenLabsVoiceId: 'VR6AewLTigWG4xSOukaG',
    sampleGreeting: "Guten Tag! Wie kann ich Ihnen heute behilflich sein?",
    systemPromptDirective: "Der Anrufer spricht Deutsch. Antworten Sie fließend und natürlich auf Deutsch in kurzen Sätzen.",
    commonKeywords: ['guten tag', 'hallo', 'danke', 'bitte', 'hilfe', 'ich moechte', 'ich möchte', 'bestellung', 'konto', 'termin', 'stornieren', 'wetter', 'ja', 'nein', 'wie geht', 'auf wiedersehen'],
  },
  ja: {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    flag: '🇯🇵',
    cartesiaVoiceId: '2b568345-1d12-426b-b054-d3d63b0185a9',
    elevenLabsVoiceId: 'AZnzlk1XvdvUeBnXmlld',
    sampleGreeting: "こんにちは！本日はどのようなご用件でしょうか？",
    systemPromptDirective: "発信者は日本語で話しています。親切で自然な日本語で簡潔に返答してください。",
    commonKeywords: ['こんにちは', 'おはよう', 'ありがとう', 'お願いします', '予約', '助けて', 'キャンセル', '天気', 'はい', 'いいえ', 'どうも', '注文'],
  },
  hi: {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    flag: '🇮🇳',
    cartesiaVoiceId: 'e7cb5a46-95f7-4f93-b1d5-c9a9bb859732',
    elevenLabsVoiceId: 'N2lVS1w4EtoT3dr4eOWO',
    sampleGreeting: "नमस्ते! आज मैं आपकी क्या सहायता कर सकता हूँ?",
    systemPromptDirective: "कॉलर हिंदी में बात कर रहा है। स्वाभाविक, सरल और संक्षिप्त हिंदी में उत्तर दें।",
    commonKeywords: ['नमस्ते', 'धन्यवाद', 'मदद', 'कृपया', 'सहायता', 'बुकिंग', 'रद्द', 'मौसम', 'हाँ', 'नहीं', 'खाता', 'आदेश', 'namaste', 'dhanyawad', 'shukriya'],
  },
  pt: {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    flag: '🇧🇷',
    cartesiaVoiceId: 'd62283a0-716b-4c54-9494-0cfc383e5828',
    elevenLabsVoiceId: 'TX3LPaxmHKxFdv7VOQHJ',
    sampleGreeting: "Olá! Como posso ajudar você hoje?",
    systemPromptDirective: "O chamador está falando em português. Responda fluentemente em português conversacional e natural.",
    commonKeywords: ['olá', 'ola', 'bom dia', 'boa tarde', 'obrigado', 'obrigada', 'por favor', 'ajuda', 'preciso', 'gostaria', 'pedido', 'cancelar', 'reserva', 'sim', 'não', 'conta'],
  },
  zh: {
    code: 'zh',
    name: 'Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
    cartesiaVoiceId: 'c4a45a23-424a-4d43-982c-88ab98032c58',
    elevenLabsVoiceId: 'yoZ06a0CYIXtPAnUrqXB',
    sampleGreeting: "您好！请问今天有什么我可以帮您的吗？",
    systemPromptDirective: "来电者使用的是中文。请使用流畅、自然的中文简短地回答。",
    commonKeywords: ['您好', '你好', '谢谢', '请问', '帮助', '预订', '取消', '天气', '对', '不对', '订单', '账户', '退款'],
  },
};

export class MultilingualManager extends EventEmitter {
  private sessions: Map<string, SessionLanguageState> = new Map();

  constructor() {
    super();
  }

  /**
   * Fast heuristic and script-based language identification
   */
  detectLanguage(text: string, allowedLanguages?: string[]): LanguageDetectionResult {
    if (!text || text.trim().length === 0) {
      return {
        language: 'en',
        confidence: 0,
        script: 'latin',
        matchedKeywords: [],
        switched: false,
      };
    }

    const cleaned = text.trim();
    const lower = cleaned.toLowerCase();

    // 1. Script checks
    // Devanagari script (Hindi, Marathi, etc.)
    if (/[\u0900-\u097F]/.test(cleaned)) {
      return {
        language: 'hi',
        confidence: 0.98,
        script: 'devanagari',
        matchedKeywords: ['devanagari_script'],
        switched: false,
      };
    }

    // Japanese Hiragana & Katakana
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(cleaned)) {
      return {
        language: 'ja',
        confidence: 0.99,
        script: 'japanese',
        matchedKeywords: ['kana_script'],
        switched: false,
      };
    }

    // CJK Unified Ideographs (Chinese or Kanji)
    if (/[\u4E00-\u9FFF]/.test(cleaned)) {
      // If Kana was not present, default to Chinese
      return {
        language: 'zh',
        confidence: 0.95,
        script: 'cjk',
        matchedKeywords: ['cjk_ideographs'],
        switched: false,
      };
    }

    // 2. Lexical & N-gram matching for Latin scripts
    const scores: Record<string, { score: number; matches: string[] }> = {
      es: { score: 0, matches: [] },
      fr: { score: 0, matches: [] },
      de: { score: 0, matches: [] },
      pt: { score: 0, matches: [] },
      en: { score: 0, matches: [] },
      hi: { score: 0, matches: [] }, // Transliterated Hindi
    };

    // Specific punctuation marks
    if (/[¿¡]/.test(cleaned)) {
      scores.es.score += 4;
      scores.es.matches.push('inverted_punctuation');
    }

    // Check vocabulary across languages
    const words = lower.split(/[\s,?.!;:—"']+/).filter(w => w.length > 1);

    for (const [langCode, langInfo] of Object.entries(SUPPORTED_LANGUAGES)) {
      if (!scores[langCode]) continue;
      for (const kw of langInfo.commonKeywords) {
        if (kw.includes(' ')) {
          if (lower.includes(kw)) {
            scores[langCode].score += 3;
            scores[langCode].matches.push(kw);
          }
        } else {
          if (words.includes(kw)) {
            scores[langCode].score += 2;
            scores[langCode].matches.push(kw);
          }
        }
      }
    }

    // Accent and diacritic signals
    if (/[áéíóúüñ]/i.test(cleaned)) {
      scores.es.score += 2;
    }
    if (/[èéêëàâçîïôùû]/i.test(cleaned)) {
      scores.fr.score += 2;
    }
    if (/[äöüß]/i.test(cleaned)) {
      scores.de.score += 3;
    }
    if (/[ãõáéíóúâêôç]/i.test(cleaned)) {
      scores.pt.score += 2;
    }

    // Filter by allowedLanguages if specified
    let bestLang = 'en';
    let highestScore = 0;
    let bestMatches: string[] = [];

    for (const [lang, data] of Object.entries(scores)) {
      if (allowedLanguages && allowedLanguages.length > 0 && !allowedLanguages.includes(lang)) {
        continue;
      }
      if (data.score > highestScore) {
        highestScore = data.score;
        bestLang = lang;
        bestMatches = data.matches;
      }
    }

    const confidence = highestScore >= 4 ? 0.92 : highestScore >= 2 ? 0.75 : highestScore === 1 ? 0.55 : 0.40;

    return {
      language: bestLang,
      confidence,
      script: 'latin',
      matchedKeywords: bestMatches,
      switched: false,
    };
  }

  /**
   * Initialize or get session multilingual state
   */
  getOrInitSession(
    sessionId: string,
    initialLanguage: string = 'en',
    autoDetect: boolean = true,
    supportedLanguages: string[] = ['en', 'es', 'fr', 'de', 'ja', 'hi']
  ): SessionLanguageState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = {
        sessionId,
        currentLanguage: initialLanguage,
        autoDetectEnabled: autoDetect,
        supportedLanguages,
        switchCount: 0,
        history: [],
      };
      this.sessions.set(sessionId, state);
    }
    return state;
  }

  /**
   * Process a turn transcript and trigger seamless auto-switch if language changes
   */
  processTurnTranscript(sessionId: string, userText: string): {
    switched: boolean;
    previousLanguage: string;
    currentLanguage: string;
    detection: LanguageDetectionResult;
    voiceId: string;
    promptDirective: string;
  } {
    const session = this.getOrInitSession(sessionId);
    const detection = this.detectLanguage(userText, session.supportedLanguages);

    const prevLang = session.currentLanguage;

    // Check if auto-detect is active and language changed with sufficient confidence
    if (
      session.autoDetectEnabled &&
      !session.lockedLanguage &&
      detection.language !== prevLang &&
      detection.confidence >= 0.70 &&
      session.supportedLanguages.includes(detection.language)
    ) {
      // Perform switch
      session.currentLanguage = detection.language;
      session.switchCount++;

      const langInfo = SUPPORTED_LANGUAGES[detection.language] || SUPPORTED_LANGUAGES.en;
      const switchEvent: LanguageSwitchEvent = {
        id: `switch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        sessionId,
        fromLanguage: prevLang,
        toLanguage: detection.language,
        confidence: detection.confidence,
        triggerText: userText,
        newVoiceId: langInfo.cartesiaVoiceId,
        timestamp: Date.now(),
      };

      session.history.push(switchEvent);
      detection.switched = true;

      logger.info(`[Multilingual] Auto-switched session ${sessionId} from ${prevLang} to ${detection.language}`, {
        confidence: detection.confidence,
        triggerText: userText,
      });

      this.emit('languageSwitched', switchEvent);

      return {
        switched: true,
        previousLanguage: prevLang,
        currentLanguage: detection.language,
        detection,
        voiceId: langInfo.cartesiaVoiceId,
        promptDirective: langInfo.systemPromptDirective,
      };
    }

    const currentInfo = SUPPORTED_LANGUAGES[session.currentLanguage] || SUPPORTED_LANGUAGES.en;
    return {
      switched: false,
      previousLanguage: prevLang,
      currentLanguage: session.currentLanguage,
      detection,
      voiceId: currentInfo.cartesiaVoiceId,
      promptDirective: currentInfo.systemPromptDirective,
    };
  }

  /**
   * Manual language switch initiated by user or API
   */
  manualSwitch(sessionId: string, targetLanguage: string, lock: boolean = false): {
    success: boolean;
    previousLanguage: string;
    newLanguage: string;
    voiceId: string;
    promptDirective: string;
  } {
    const session = this.getOrInitSession(sessionId);
    const targetInfo = SUPPORTED_LANGUAGES[targetLanguage];

    if (!targetInfo) {
      throw new Error(`Unsupported language code: ${targetLanguage}`);
    }

    const prevLang = session.currentLanguage;
    session.currentLanguage = targetLanguage;
    session.switchCount++;
    if (lock) {
      session.lockedLanguage = targetLanguage;
    } else {
      delete session.lockedLanguage;
    }

    const switchEvent: LanguageSwitchEvent = {
      id: `manual_switch_${Date.now()}`,
      sessionId,
      fromLanguage: prevLang,
      toLanguage: targetLanguage,
      confidence: 1.0,
      triggerText: '[MANUAL_OPERATOR_SWITCH]',
      newVoiceId: targetInfo.cartesiaVoiceId,
      timestamp: Date.now(),
    };
    session.history.push(switchEvent);

    this.emit('languageSwitched', switchEvent);

    return {
      success: true,
      previousLanguage: prevLang,
      newLanguage: targetLanguage,
      voiceId: targetInfo.cartesiaVoiceId,
      promptDirective: targetInfo.systemPromptDirective,
    };
  }

  /**
   * Toggle auto-detect mode for a session
   */
  setAutoDetect(sessionId: string, enabled: boolean): SessionLanguageState {
    const session = this.getOrInitSession(sessionId);
    session.autoDetectEnabled = enabled;
    return session;
  }

  /**
   * Get all supported languages catalog
   */
  getSupportedLanguages(): LanguageInfo[] {
    return Object.values(SUPPORTED_LANGUAGES);
  }

  /**
   * Get session status
   */
  getSession(sessionId: string): SessionLanguageState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Clear session state
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

export const multilingualManager = new MultilingualManager();
