/**
 * tts.ts — Text-to-Speech via Google Cloud WaveNet
 * Voix naturelle fr-FR / en-US selon la langue détectée.
 * Fallback automatique vers expo-speech si Google échoue.
 

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

// ── Ta clé API Google Cloud TTS ───────────────────────────────────────────────
const GOOGLE_TTS_API_KEY = 'AIzaSyC8bW_57Vh28gY3IV5ctFVfl5k1E2Onc_s';

const GOOGLE_TTS_URL =
  `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`;

// ── Voix WaveNet disponibles ──────────────────────────────────────────────────
const VOICES = {
  'fr-FR': 'fr-FR-Wavenet-D',   // homme français naturel
  'en-US': 'en-US-Wavenet-D',   // homme anglais naturel
};

// ── Son en cours (pour pouvoir le couper) ─────────────────────────────────────
let _currentPlayer: AudioPlayer | null = null;

// ── Détection de langue ───────────────────────────────────────────────────────
function detectLanguage(text: string): 'fr-FR' | 'en-US' {
  const frWords = [
    'le', 'la', 'les', 'de', 'du', 'un', 'une', 'est', 'sont',
    'je', 'tu', 'il', 'nous', 'vous', 'ils', 'que', 'qui',
    'sur', 'dans', 'avec', 'pour', 'par', 'pas', 'plus', 'voici',
    'jai', 'cest', 'tout', 'bien', 'fait', 'ouvert', 'fermé',
  ];
  const enWords = [
    'the', 'is', 'are', 'was', 'were', 'you', 'your', 'this',
    'that', 'have', 'has', 'with', 'from', 'they', 'will',
    'can', 'not', 'but', 'and', 'for', 'done', 'opened',
  ];

  const words = text.toLowerCase().replace(/[^a-zàâéèêëîïôùûüç\s]/g, '').split(/\s+/);
  let frScore = 0;
  let enScore = 0;

  for (const word of words) {
    if (frWords.includes(word)) frScore++;
    if (enWords.includes(word)) enScore++;
  }

  return enScore > frScore ? 'en-US' : 'fr-FR';
}

// ── Couper le son en cours ────────────────────────────────────────────────────
export async function stopSpeaking(): Promise<void> {
  try {
    if (_currentPlayer) {
      _currentPlayer.pause();
      _currentPlayer.remove();
      _currentPlayer = null;
    }
  } catch {
    // silence
  }
  Speech.stop();
}

// ── Fonction principale ───────────────────────────────────────────────────────
export async function speak(
  text: string,
  forceLang?: 'fr-FR' | 'en-US',
): Promise<void> {
  if (!text?.trim()) return;

  // Couper la parole précédente
  await stopSpeaking();

  const language = forceLang ?? detectLanguage(text);

  // Tenter Google WaveNet
  const success = await speakWithGoogle(text, language);

  // Fallback expo-speech si Google échoue
  if (!success) {
    Speech.speak(text.trim(), {
      language: language === 'fr-FR' ? 'fr-FR' : 'en-US',
      pitch: 1.0,
      rate: 0.92,
    });
  }
}

// ── Appel Google Cloud TTS ────────────────────────────────────────────────────
async function speakWithGoogle(
  text: string,
  language: 'fr-FR' | 'en-US',
): Promise<boolean> {
  try {
    // Configurer l'audio (important sur iOS)
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });

    // Appel API Google
    const response = await fetch(GOOGLE_TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: text.trim() },
        voice: {
          languageCode: language,
          name: VOICES[language],
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 0.95,   // légèrement plus lent = plus naturel
          pitch: 0.0,           // 0 = naturel, + = aigu, - = grave
          volumeGainDb: 0.0,
        },
      }),
    });

    if (!response.ok) {
      console.warn(`Google TTS HTTP ${response.status}`);
      return false;
    }

    const data = await response.json();
    const audioBase64: string = data?.audioContent;

    if (!audioBase64) {
      console.warn('Google TTS: audioContent vide');
      return false;
    }

    // Jouer l'audio base64
    const { sound } = await Audio.Sound.createAsync(
      { uri: `data:audio/mp3;base64,${audioBase64}` },
      { shouldPlay: true, volume: 1.0 },
    );

    _currentSound = sound;

    // Libérer la mémoire quand c'est fini
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
        _currentSound = null;
      }
    });

    return true;

  } catch (error) {
    console.warn('Google TTS erreur:', error);
    return false;
  }
}*/

/**
 * tts.ts — Text-to-Speech via Azure Cognitive Services Neural
 * Voix naturelle fr-FR / en-US selon la langue détectée.
 * Fallback automatique vers expo-speech si Azure échoue.
 */

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import * as Speech from 'expo-speech';

// ── Configuration Azure Speech ────────────────────────────────────────────────
const AZURE_SPEECH_KEY    = '3jpRXV9ChK30mK5HOodRHvl7ifDovev6qyDBbYx87O7DDdZDaNBiJQQJ99CCACF24PCXJ3w3AAAYACOGPkeR';
const AZURE_SPEECH_REGION = 'uaenorth';

const AZURE_TTS_URL = `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

// ── Voix Neural disponibles ───────────────────────────────────────────────────
const VOICES = {
  'fr-FR': 'fr-FR-VivienneMultilingualNeural',
  'en-GB': 'en-GB-MaisieNeural',
};
type LangCode = 'fr-FR' | 'en-GB';

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;

    const triple = (a << 16) | (b << 8) | c;

    output += alphabet[(triple >> 18) & 63];
    output += alphabet[(triple >> 12) & 63];
    output += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : '=';
    output += i + 2 < bytes.length ? alphabet[triple & 63] : '=';
  }

  return output;
}

// ── Son en cours (pour pouvoir le couper) ─────────────────────────────────────
let _currentPlayer: AudioPlayer | null = null;

// ── Détection de langue ───────────────────────────────────────────────────────
function detectLanguage(text: string): 'fr-FR' | 'en-GB' {
  const frWords = [
    'le', 'la', 'les', 'de', 'du', 'un', 'une', 'est', 'sont',
    'je', 'tu', 'il', 'nous', 'vous', 'ils', 'que', 'qui',
    'sur', 'dans', 'avec', 'pour', 'par', 'pas', 'plus', 'voici',
    'jai', 'cest', 'tout', 'bien', 'fait', 'ouvert', 'fermé',
    'salut', 'bonjour', 'merci', 'oui', 'non',
  ];
  const enWords = [
    'the', 'is', 'are', 'was', 'were', 'you', 'your', 'this',
    'that', 'have', 'has', 'with', 'from', 'they', 'will',
    'can', 'not', 'but', 'and', 'for', 'done', 'opened', 'hello',
  ];

  const words = text.toLowerCase().replace(/[^a-zàâéèêëîïôùûüç\s]/g, '').split(/\s+/);
  let frScore = 0;
  let enScore = 0;

  for (const word of words) {
    if (frWords.includes(word)) frScore++;
    if (enWords.includes(word)) enScore++;
  }

  return enScore > frScore ? 'en-GB' : 'fr-FR';
}

// ── Couper le son en cours ────────────────────────────────────────────────────

export async function stopSpeaking(): Promise<void> {
  try {
    if (_currentPlayer) {
      _currentPlayer.pause();
      _currentPlayer.remove();
      _currentPlayer = null;
    }
  } catch {
    // silence
  }
  Speech.stop();
}

// ── Fonction principale ───────────────────────────────────────────────────────
export async function speak(
  text: string,
  forceLang?: 'fr-FR' | 'en-GB',
): Promise<void> {
  if (!text?.trim()) return;

  // Couper la parole précédente
  await stopSpeaking();

  const language = forceLang ?? detectLanguage(text);

  // Tenter Azure Neural
  const success = await speakWithAzure(text, language);

  // Fallback expo-speech si Azure échoue
  if (!success) {
    Speech.speak(text.trim(), {
      language: language === 'fr-FR' ? 'fr-FR' : 'en-GB',
      pitch: 1.0,
      rate: 0.92,
    });
  }
}

// ── Appel Azure Cognitive Services TTS ───────────────────────────────────────
async function speakWithAzure(
  text: string,
  language: 'fr-FR' | 'en-GB',
): Promise<boolean> {
  try {
    // Configurer l'audio global pour lecture uniquement
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });

    const voiceName = VOICES[language];

    // SSML simple pour maximiser la compatibilite des voix Azure
    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
             xml:lang="${language}">
        <voice name="${voiceName}">
          <prosody rate="0%" pitch="0%">
            ${text.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
          </prosody>
        </voice>
      </speak>
    `.trim();

    // Appel API Azure
    const response = await fetch(AZURE_TTS_URL, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
        'Content-Type':              'application/ssml+xml',
        'X-Microsoft-OutputFormat':  'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent':                'JarvisApp',
      },
      body: ssml,
    });

    if (!response.ok) {
      console.warn(`Azure TTS HTTP ${response.status}`);
      return false;
    }

    // React Native ne supporte pas URL.createObjectURL pour les blobs.
    // On convertit les bytes en base64 puis on lit via data URI.
    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = bytesToBase64(new Uint8Array(audioBuffer));
    const audioUri = `data:audio/mp3;base64,${audioBase64}`;

    const player = createAudioPlayer({ uri: audioUri }, { updateInterval: 250 });
    player.volume = 1.0;
    player.play();

    _currentPlayer = player;

    // Libérer la mémoire quand c'est fini
    player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (status.didJustFinish) {
        player.remove();
        if (_currentPlayer && _currentPlayer.id === player.id) {
          _currentPlayer = null;
        }
      }
    });

    return true;

  } catch (error) {
    console.warn('Azure TTS erreur:', error);
    return false;
  }
}