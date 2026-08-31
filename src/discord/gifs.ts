/**
 * Anime reaction GIF support via the OtakuGIFs API.
 *
 *   GET https://api.otakugifs.xyz/gif?reaction=<name>&format=gif
 *   → { url: 'https://cdn.otakugifs.xyz/gifs/<name>/<id>.gif' }
 *
 * No API key required.
 */

export const REACTIONS: readonly string[] = [
  'airkiss', 'angrystare', 'bite', 'bleh', 'blush', 'brofist', 'celebrate',
  'cheers', 'clap', 'confused', 'cool', 'cry', 'cuddle', 'dance', 'drool',
  'evillaugh', 'facepalm', 'handhold', 'happy', 'headbang', 'hug', 'huh',
  'kiss', 'laugh', 'lick', 'love', 'mad', 'nervous', 'no', 'nom', 'nosebleed',
  'nuzzle', 'nyah', 'pat', 'peek', 'pinch', 'poke', 'pout', 'punch', 'roll',
  'run', 'sad', 'scared', 'shout', 'shrug', 'shy', 'sigh', 'sing', 'sip',
  'slap', 'sleep', 'slowclap', 'smack', 'smile', 'smug', 'sneeze', 'sorry',
  'stare', 'stop', 'surprised', 'sweat', 'thumbsup', 'tickle', 'tired',
  'wave', 'wink', 'woah', 'yawn', 'yay', 'yes',
];

/**
 * Maps natural-language intents (verbs/sentiments) to one or more candidate
 * reactions, so the agent can turn "hit them", "give them a kiss", etc. into a
 * concrete reaction even when the word isn't a reaction name itself.
 */
const INTENT_MAP: Record<string, string[]> = {
  kiss: ['kiss', 'airkiss', 'love'],
  hug: ['hug', 'cuddle', 'nuzzle'],
  cuddle: ['cuddle', 'hug', 'nuzzle'],
  nuzzle: ['nuzzle', 'cuddle'],
  hit: ['punch', 'slap', 'smack'],
  punch: ['punch'],
  slap: ['slap', 'smack'],
  kill: ['punch', 'angrystare', 'slap'],
  beat: ['punch', 'slap'],
  wave: ['wave', 'shy'],
  hi: ['wave', 'smile'],
  hello: ['wave', 'smile'],
  bye: ['wave', 'sad'],
  cry: ['cry', 'sad', 'sigh'],
  sad: ['sad', 'cry', 'sigh'],
  cryhard: ['cry', 'sad'],
  laugh: ['laugh', 'evillaugh', 'smile'],
  lol: ['laugh', 'evillaugh'],
  lmao: ['laugh', 'evillaugh'],
  funny: ['laugh', 'smile', 'smug'],
  dance: ['dance', 'happy', 'celebrate'],
  happy: ['happy', 'smile', 'yay'],
  smile: ['smile', 'happy'],
  pat: ['pat', 'tickle'],
  tickle: ['tickle', 'pat'],
  poke: ['poke', 'pinch'],
  pinch: ['pinch', 'poke'],
  love: ['love', 'kiss', 'blush'],
  blush: ['blush', 'shy'],
  shy: ['shy', 'blush', 'nervous'],
  sleep: ['sleep', 'tired', 'yawn'],
  tired: ['tired', 'yawn', 'sleep'],
  mad: ['mad', 'angrystare', 'pout'],
  angry: ['mad', 'angrystare', 'pout'],
  annoyed: ['pout', 'sigh', 'facepalm'],
  facepalm: ['facepalm', 'sigh'],
  scared: ['scared', 'nervous'],
  nervous: ['nervous', 'scared', 'sweat'],
  eat: ['nom', 'drool'],
  hungry: ['nom', 'drool'],
  drink: ['sip', 'cheers'],
  cheers: ['cheers', 'clap', 'celebrate'],
  celebrate: ['celebrate', 'yay', 'clap'],
  yes: ['yes', 'thumbsup', 'yay'],
  no: ['no', 'shrug', 'stop'],
  sorry: ['sorry', 'sad'],
  confused: ['confused', 'huh', 'shrug'],
  huh: ['huh', 'confused'],
  stop: ['stop', 'no'],
  dance2: ['dance', 'headbang'],
};

/**
 * nekos.best — a second source with more reaction GIFs plus 4 image categories.
 *   GET https://nekos.best/api/v2/<category>  → { results: [{ url, ... }] }
 */
export const NEKOS_BEST_GIF_CATEGORIES: readonly string[] = [
  'angry', 'baka', 'bite', 'bleh', 'blowkiss', 'blush', 'bonk', 'bored',
  'carry', 'clap', 'confused', 'cry', 'cuddle', 'dance', 'facepalm', 'feed',
  'handhold', 'handshake', 'happy', 'highfive', 'hug', 'kabedon', 'kick',
  'kiss', 'lappillow', 'laugh', 'lurk', 'nod', 'nom', 'nope', 'nya', 'pat',
  'peck', 'poke', 'pout', 'punch', 'run', 'salute', 'shake', 'shoot',
  'shocked', 'shrug', 'sip', 'slap', 'sleep', 'smile', 'smug', 'spin',
  'stare', 'tableflip', 'teehee', 'think', 'thumbsup', 'tickle', 'wag',
  'wave', 'wink', 'yawn', 'yeet',
];

export const NEKOS_BEST_IMAGE_CATEGORIES: readonly string[] = ['neko', 'kitsune', 'husband', 'waifu'];

const NEKOS_BEST_API = 'https://nekos.best/api/v2';

/**
 * Maps an otakugifs reaction name to the closest nekos.best category, where one
 * exists. Reactions without a mapping fall back to otakugifs.
 */
const NEKOS_BEST_MAP: Record<string, string> = {
  airkiss: 'blowkiss',
  angrystare: 'angry',
  bite: 'bite',
  bleh: 'bleh',
  blush: 'blush',
  brofist: 'highfive',
  celebrate: 'happy',
  cheers: 'clap',
  clap: 'clap',
  confused: 'confused',
  cool: 'smug',
  cry: 'cry',
  cuddle: 'cuddle',
  dance: 'dance',
  drool: 'nom',
  evillaugh: 'laugh',
  facepalm: 'facepalm',
  handhold: 'handhold',
  happy: 'happy',
  hug: 'hug',
  huh: 'confused',
  kiss: 'kiss',
  laugh: 'laugh',
  love: 'blush',
  mad: 'angry',
  nervous: 'shocked',
  no: 'nope',
  nom: 'nom',
  nuzzle: 'cuddle',
  nyah: 'nya',
  pat: 'pat',
  peek: 'lurk',
  pinch: 'poke',
  poke: 'poke',
  pout: 'pout',
  punch: 'punch',
  run: 'run',
  sad: 'cry',
  scared: 'shocked',
  shrug: 'shrug',
  shy: 'blush',
  sigh: 'shrug',
  sip: 'sip',
  slap: 'slap',
  sleep: 'sleep',
  slowclap: 'clap',
  smack: 'slap',
  smile: 'smile',
  smug: 'smug',
  stare: 'stare',
  stop: 'nope',
  surprised: 'shocked',
  thumbsup: 'thumbsup',
  tickle: 'tickle',
  tired: 'yawn',
  wave: 'wave',
  wink: 'wink',
  woah: 'shocked',
  yawn: 'yawn',
  yay: 'happy',
  yes: 'nod',
};

const DEFAULT_API = 'https://api.otakugifs.xyz/gif';

export function apiBaseUrl(): string {
  return (process.env.GIF_API_BASE_URL ?? DEFAULT_API).replace(/\/+$/, '');
}

function pickRandom(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)] ?? 'smile';
}

/**
 * Resolves free-form input ("kiss", "hit them", "punch", "give a hug") to a
 * valid reaction name, falling back to "smile".
 */
export function resolveReaction(input: string): string {
  const lower = input.toLowerCase().trim();
  if (!lower) return 'smile';
  if ((REACTIONS as string[]).includes(lower)) return lower;

  for (const [intent, candidates] of Object.entries(INTENT_MAP)) {
    if (lower.includes(intent)) return pickRandom(candidates);
  }
  return 'smile';
}

export interface GifFetchResult {
  reaction: string;
  url: string;
}

/** Fetches a (random) GIF URL for a given reaction. */
export async function fetchGif(reaction: string): Promise<GifFetchResult> {
  const resolved = resolveReaction(reaction);
  const url = `${apiBaseUrl()}?reaction=${encodeURIComponent(resolved)}&format=gif`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GIF API request failed (${res.status})`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) {
    throw new Error('GIF API returned no url');
  }
  return { reaction: resolved, url: data.url };
}

export interface NekosBestResult {
  category: string;
  url: string;
  isImage: boolean;
}

/**
 * nekos.best requires a `User-Agent` header in the format
 * `APP_NAME (CONTACT_INFO)`. Override via NEKOS_BEST_USER_AGENT.
 */
function nekosBestUserAgent(): string {
  return (
    process.env.NEKOS_BEST_USER_AGENT ??
    'DiscordAgent (https://github.com/NacreousDawn596/DiscordMCP)'
  );
}

/** Fetches a (random) result from nekos.best for a GIF or image category. */
export async function fetchNekosBest(category: string): Promise<NekosBestResult> {
  const url = `${NEKOS_BEST_API}/${encodeURIComponent(category)}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': nekosBestUserAgent() },
  });
  if (!res.ok) {
    throw new Error(`nekos.best request failed (${res.status})`);
  }
  const data = (await res.json()) as { results?: Array<{ url?: string }> };
  const first = data.results?.[0];
  if (!first?.url) {
    throw new Error('nekos.best returned no result');
  }
  return { category, url: first.url, isImage: NEKOS_BEST_IMAGE_CATEGORIES.includes(category) };
}

export interface ReactionGif {
  /** Canonical reaction name (used for captioning). */
  reaction: string;
  url: string;
  source: 'nekos_best' | 'otakugifs';
}

/**
 * Unified reaction-GIF fetcher: prefers nekos.best (richer category coverage)
 * and falls back to otakugifs for reactions it doesn't have.
 */
export async function fetchReactionGif(input: string): Promise<ReactionGif> {
  const resolved = resolveReaction(input);
  const nekoCategory = NEKOS_BEST_MAP[resolved];
  if (nekoCategory) {
    try {
      const r = await fetchNekosBest(nekoCategory);
      return { reaction: resolved, url: r.url, source: 'nekos_best' };
    } catch {
      // fall through to otakugifs
    }
  }
  const r = await fetchGif(resolved);
  return { reaction: resolved, url: r.url, source: 'otakugifs' };
}

/** Fetches a nekos.best image (neko / kitsune / husband / waifu). */
export async function fetchImage(category: string): Promise<{ category: string; url: string }> {
  const c = category.toLowerCase().trim();
  if (!(NEKOS_BEST_IMAGE_CATEGORIES as string[]).includes(c)) {
    throw new Error(`Unknown image category "${category}". Use: ${NEKOS_BEST_IMAGE_CATEGORIES.join(', ')}.`);
  }
  const r = await fetchNekosBest(c);
  return { category: c, url: r.url };
}

function stripMention(raw: string): string {
  return raw.replace(/<@!?(\d+)>/g, '').replace(/@/g, '').trim();
}

/**
 * Builds a playful caption for a reaction, optionally directed at a target user.
 */
export function buildCaption(reaction: string, actor: string, target?: string): string {
  const t = target ? stripMention(target) : undefined;
  const a = stripMention(actor) || 'Someone';

  switch (reaction) {
    case 'kiss':
      return t ? `${a} just kissed ${t}! 💕` : `${a} blew a kiss!`;
    case 'airkiss':
      return t ? `${a} blew an air-kiss at ${t}! 😘` : `${a} blew an air-kiss!`;
    case 'hug':
      return t ? `${a} gave ${t} a big warm hug! 🤗` : `${a} needs a hug!`;
    case 'cuddle':
      return t ? `${a} cuddled up with ${t}! 🥰` : `${a} is feeling cuddly!`;
    case 'nuzzle':
      return t ? `${a} nuzzled against ${t}! 🥺` : `${a} is nuzzling!`;
    case 'punch':
      return t ? `${a} punched ${t} so hard they flew across the room! 💥` : `${a} threw a punch!`;
    case 'slap':
      return t ? `${a} slapped ${t} so hard they saw stars! ✨` : `${a} slapped the air!`;
    case 'smack':
      return t ? `${a} smacked ${t}! 💢` : `${a} is ready to smack!`;
    case 'angrystare':
      return t ? `${a} is staring daggers at ${t}! 😠` : `${a} is furious!`;
    case 'mad':
      return t ? `${a} is so mad at ${t}! 😡` : `${a} is fuming!`;
    case 'pat':
      return t ? `${a} gently patted ${t} on the head! 🫳` : `${a} wants headpats!`;
    case 'tickle':
      return t ? `${a} tickled ${t} until they couldn't breathe! 😂` : `${a} is being tickled!`;
    case 'poke':
      return t ? `${a} poked ${t}! 👉` : `${a} poked the air!`;
    case 'love':
      return t ? `${a} loves ${t}! ❤️` : `${a} is full of love!`;
    case 'blush':
      return t ? `${a} blushed at ${t}! 😊` : `${a} is blushing!`;
    case 'cry':
      return t ? `${a} cried because of ${t}! 😭` : `${a} is crying!`;
    case 'sad':
      return t ? `${a} is sad about ${t}! 😢` : `${a} is feeling down!`;
    case 'laugh':
      return t ? `${a} is laughing at ${t}! 😂` : `${a} burst out laughing!`;
    case 'evillaugh':
      return t ? `${a} laughed evilly at ${t}! 😈` : `${a} let out an evil laugh!`;
    case 'wave':
      return t ? `${a} waved at ${t}! 👋` : `${a} waved hello!`;
    case 'dance':
      return t ? `${a} is dancing with ${t}! 💃` : `${a} started dancing!`;
    case 'happy':
      return t ? `${a} is so happy to see ${t}! 😄` : `${a} is overjoyed!`;
    case 'smile':
      return t ? `${a} smiled at ${t}! 🙂` : `${a} is smiling!`;
    case 'scared':
      return t ? `${a} is terrified of ${t}! 😱` : `${a} got scared!`;
    case 'nervous':
      return t ? `${a} is nervous around ${t}! 😅` : `${a} is feeling nervous!`;
    case 'sleep':
      return t ? `${a} fell asleep on ${t}! 😴` : `${a} is dozing off!`;
    case 'tired':
      return t ? `${a} is exhausted because of ${t}! 🥱` : `${a} is so tired!`;
    case 'yawn':
      return `${a} let out a huge yawn! 🥱`;
    case 'sip':
      return `${a} took a sip! 🍵`;
    case 'nom':
      return `${a} is nomming! 🍽️`;
    case 'cheers':
      return t ? `${a} cheers ${t}! 🥂` : `${a} cheers!`;
    case 'clap':
      return t ? `${a} clapped for ${t}! 👏` : `${a} is clapping!`;
    case 'celebrate':
      return t ? `${a} is celebrating with ${t}! 🎉` : `${a} is celebrating!`;
    case 'facepalm':
      return t ? `${a} facepalmed at ${t}! 🤦` : `${a} facepalmed!`;
    case 'thumbsup':
      return `${a} gives a thumbs up! 👍`;
    case 'yes':
      return `${a} says yes! ✅`;
    case 'no':
      return `${a} says no! ❌`;
    case 'sorry':
      return `${a} is sorry! 🙏`;
    case 'confused':
      return t ? `${a} is confused by ${t}! 🤔` : `${a} is confused!`;
    case 'shrug':
      return `${a} shrugged! 🤷`;
    case 'sigh':
      return `${a} sighed deeply! 😮‍💨`;
    case 'wink':
      return t ? `${a} winked at ${t}! 😉` : `${a} winked!`;
    case 'stare':
      return t ? `${a} is staring at ${t}! 👀` : `${a} is staring!`;
    case 'surprised':
      return t ? `${a} is shocked by ${t}! 😲` : `${a} is surprised!`;
    case 'run':
      return `${a} ran away! 🏃`;
    case 'cool':
      return `${a} is looking cool! 😎`;
    case 'sneeze':
      return `${a} sneezed! 🤧`;
    case 'shout':
      return `${a} is shouting! 📢`;
    case 'smug':
      return `${a} looks smug! 😏`;
    case 'sing':
      return `${a} is singing! 🎤`;
    case 'headbang':
      return `${a} is headbanging! 🤘`;
    default:
      return t ? `${a} ${reaction}s at ${t}!` : `${a} is feeling ${reaction}!`;
  }
}
