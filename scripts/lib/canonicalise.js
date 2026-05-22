// Turn a free-text `field` string ("actor and theatre director and screenwriter")
// into a normalised taxonomy: a list of roles, and one or more domains.
//
// The dictionary covers the top ~200 fragments by frequency, which catches
// most of the corpus directly. For the long tail, two fallbacks:
//   1. ALIASES collapses synonyms and variants (author → writer, etc.)
//   2. SUFFIX_MATCH catches modifier-prefixed roles ("late modernist poet"
//      ends with "poet" → role:"poet", domain inherits).
//
// Anything that still doesn't match keeps its original fragment as a role
// and gets domain "other". The unmatched list is logged so we can extend
// the dictionary incrementally.

// ----------------------------------------------------------------------
// Aliases: source-of-truth role names. Map variants to canonical form.
// ----------------------------------------------------------------------

const ALIASES = {
  author: 'writer',
  actress: 'actor',
  film_maker: 'film-maker',
  filmmaker: 'film-maker',
  documentary_filmmaker: 'documentary film-maker',
  'tv presenter': 'television presenter',
  'tv producer': 'television producer',
  'tv director': 'television director',
  'tv writer': 'television writer',
  'tv journalist': 'television journalist',
  'tv executive': 'television executive',
  'film actor': 'actor',
  'television actor': 'actor',
  'comedy actor': 'actor',
  'character actor': 'actor',
  'voice actor': 'voice artist',
  physician: 'doctor',
  scientist: 'scientist',
  'football player': 'footballer',
  'cricket player': 'cricketer',
  'theater': 'theatre',
  'theater director': 'theatre director',
  'theater producer': 'theatre producer',
  'sportsman': 'athlete',
  'sportswoman': 'athlete',
  'scriptwriter': 'screenwriter',
  'science-fiction writer': 'science fiction writer',
  'soul': 'singer',          // truncations from comma-splits
  'rock': 'musician',
  'jazz': 'musician',
  'blues': 'musician',
  'opera': 'opera singer',
  'theatre': 'theatre director',
  'film': 'film director',
  'television': 'broadcaster',
  'stage': 'theatre director',
  'children\'s': 'children\'s writer',
  'documentary': 'documentary film-maker',
  'documentary filmmaker': 'documentary film-maker',
  'documentary-maker': 'documentary film-maker',
  'documentary maker': 'documentary film-maker',
  'science fiction': 'science fiction writer',
  'science fiction author': 'science fiction writer',
  'sci-fi writer': 'science fiction writer',
  'general practitioner': 'doctor',
  'gp': 'doctor',
  'tv': 'broadcaster',
  'qc': 'barrister',
  'kc': 'barrister',
};

// ----------------------------------------------------------------------
// Domain map: role → domain. Edits here directly shape the taxonomy
// surfaced to readers. Keep domains few and Guardian-section-shaped.
// ----------------------------------------------------------------------

const DOMAIN_TABLE = {
  'stage and screen': [
    'actor', 'comedian', 'dancer', 'ballet dancer', 'ballerina',
    'choreographer', 'model', 'casting director', 'film director',
    'theatre director', 'television director', 'opera director',
    'stage director', 'film producer', 'television producer',
    'theatre producer', 'screenwriter', 'television writer',
    'film-maker', 'documentary film-maker', 'animator',
    'voice artist', 'performer', 'entertainer', 'cinematographer',
    'film editor', 'production designer', 'costume designer',
    'lighting designer', 'set designer', 'stage designer',
    'art director', 'film critic', 'television personality',
    'television executive', 'broadcasting executive',
    'film actor', 'comedy actor', 'character actor', 'television presenter',
    'radio presenter', 'tv presenter', 'presenter', 'dramatist',
    'impresario', 'magician', 'puppeteer', 'impressionist',
    'mime artist', 'circus performer', 'ventriloquist',
  ],

  'music': [
    'singer', 'musician', 'composer', 'conductor', 'songwriter',
    'singer-songwriter', 'bandleader', 'guitarist', 'pianist',
    'drummer', 'violinist', 'cellist', 'bassist', 'bass player',
    'bass guitarist', 'trumpeter', 'trumpet player', 'saxophonist',
    'flautist', 'organist', 'percussionist', 'keyboardist',
    'keyboard player', 'soprano', 'tenor', 'baritone',
    'mezzo-soprano', 'vocalist', 'lyricist', 'arranger', 'dj',
    'record producer', 'music producer', 'opera singer',
    'choirmaster', 'music critic', 'musicologist', 'rapper',
    'jazz pianist', 'jazz singer', 'jazz drummer', 'jazz guitarist',
    'jazz saxophonist', 'jazz trumpeter', 'folk singer',
    'folk musician', 'soul singer', 'rock singer', 'pop singer',
    'rock musician', 'rock guitarist', 'rock drummer',
    'blues singer', 'blues musician', 'r&b singer', 'reggae singer',
    'country singer', 'country music singer', 'music manager',
    'music journalist', 'recording engineer', 'clarinettist',
    'harpsichordist', 'harmonica player', 'banjo player',
    'music promoter', 'sound engineer', 'multi-instrumentalist',
    'vibraphonist', 'accordionist', 'mandolin player',
    'choir director',
  ],

  'letters': [
    'writer', 'novelist', 'poet', 'playwright', 'biographer',
    'essayist', 'columnist', 'journalist', 'editor', 'publisher',
    'translator', 'literary critic', 'children\'s writer',
    'children\'s author', 'crime writer', 'food writer',
    'science fiction writer', 'travel writer', 'fashion editor',
    'magazine editor', 'newspaper editor', 'war correspondent',
    'foreign correspondent', 'photojournalist', 'art critic',
    'theatre critic', 'critic', 'literary scholar', 'literary agent',
    'cookery writer', 'thriller writer', 'crime novelist',
    'investigative journalist', 'television journalist',
    'shipping correspondent', 'sports writer', 'biographer',
    'columnist', 'commentator', 'cartoonist', 'broadcaster',
    'sports broadcaster', 'food critic', 'memoirist', 'satirist',
    'political analyst', 'cookery writer', 'sports writer',
    'television pundit', 'pundit', 'newsreader', 'newspaper publisher',
    'television scriptwriter', 'scriptwriter', 'media mogul',
  ],

  'visual arts': [
    'artist', 'painter', 'abstract painter', 'sculptor', 'photographer',
    'illustrator', 'designer', 'fashion designer', 'graphic designer',
    'industrial designer', 'ceramicist', 'potter', 'printmaker',
    'comic book artist', 'conceptual artist', 'performance artist',
    'visual artist', 'pop artist', 'typographer', 'curator',
    'museum director', 'museum curator', 'gallery owner',
    'war photographer', 'art director', 'couturier', 'letter cutter',
    'heritage curator', 'art dealer', 'art collector', 'collector',
    'fashion stylist', 'tattoo artist', 'jeweller',
  ],

  'architecture': [
    'architect', 'urban planner', 'landscape architect',
    'interior designer', 'architectural historian',
  ],

  'sciences': [
    'scientist', 'physicist', 'theoretical physicist', 'biologist',
    'chemist', 'mathematician', 'astronomer', 'biochemist',
    'geneticist', 'neuroscientist', 'ecologist', 'zoologist',
    'palaeontologist', 'anthropologist', 'archaeologist',
    'immunologist', 'epidemiologist', 'computer scientist',
    'astrophysicist', 'naturalist', 'engineer', 'inventor',
    'geographer', 'meteorologist', 'computing scientist',
    'wildlife cameraman', 'ornithologist', 'primatologist',
    'pharmacologist', 'statistician', 'microbiologist',
    'computer programmer', 'botanist', 'cosmologist',
    'crystallographer', 'oceanographer',
  ],

  'academia and thought': [
    'academic', 'professor', 'lecturer', 'historian', 'philosopher',
    'economist', 'sociologist', 'political scientist', 'theologian',
    'art historian', 'medieval historian', 'military historian',
    'social historian', 'byzantine historian', 'scholar', 'theorist',
    'social scientist', 'criminologist', 'political theorist',
    'educationist', 'educator', 'teacher', 'health economist',
    'foundation director', 'elections expert', 'classicist',
    'historian of science', 'orientalist',
  ],

  'public life': [
    'politician', 'mp', 'labour mp', 'conservative mp',
    'liberal democrat mp', 'labour politician',
    'conservative politician', 'liberal democrat politician',
    'prime minister', 'president', 'us senator', 'mayor',
    'councillor', 'local government politician', 'civil servant',
    'public servant', 'diplomat', 'judge', 'high court judge',
    'lawyer', 'barrister', 'solicitor', 'human rights lawyer',
    'statesman', 'political adviser', 'intelligence officer',
    'codebreaker', 'political leader', 'minister', 'administrator',
    'peer', 'spy', 'government adviser', 'us supreme court justice',
    'supreme court justice', 'senator', 'congressman',
    'congresswoman', 'governor',
  ],

  'armed forces': [
    'soldier', 'officer', 'general', 'admiral', 'pilot',
    'air commodore', 'military leader', 'police officer',
    'military commander', 'field marshal', 'air vice-marshal',
    'commando', 'wartime pilot', 'metropolitan police commissioner',
  ],

  'sport': [
    'footballer', 'cricketer', 'rugby player', 'rugby league player',
    'rugby union player', 'tennis player', 'golfer', 'snooker player',
    'boxer', 'heavyweight boxer', 'athlete', 'cyclist',
    'racing driver', 'formula one racing driver', 'jockey',
    'swimmer', 'racehorse trainer', 'football manager',
    'coach', 'boxing trainer', 'sports administrator',
    'chess grandmaster', 'mountaineer', 'astronaut', 'manager',
    'director', 'basketball player', 'goalkeeper',
    'fencer', 'wrestler', 'ice skater', 'sailor',
  ],

  'business': [
    'businessman', 'businesswoman', 'entrepreneur', 'industrialist',
    'banker', 'financier', 'brewer', 'retailer', 'restaurateur',
    'hotelier', 'business executive', 'executive',
    'property developer', 'arts administrator', 'charity founder',
    'philanthropist', 'producer', 'chef', 'nightclub owner',
  ],

  'activism and civil society': [
    'campaigner', 'activist', 'political activist',
    'civil rights activist', 'human rights activist',
    'human rights campaigner', 'peace activist', 'peace campaigner',
    'anti-apartheid activist', 'environmentalist', 'conservationist',
    'disability campaigner', 'disability rights campaigner',
    'trade union leader', 'trade unionist', 'social worker',
    'community worker', 'charity fundraiser', 'humanitarian',
    'gay rights campaigner', 'feminist', 'charity worker',
    'aid worker', 'volunteer', 'youth worker',
  ],

  'religion': [
    'bishop', 'priest', 'rabbi', 'imam', 'vicar', 'archbishop',
    'monk', 'nun', 'clergyman',
  ],

  'medicine': [
    'doctor', 'surgeon', 'nurse', 'psychotherapist', 'psychoanalyst',
    'psychiatrist', 'psychologist', 'clinical psychologist',
    'radiotherapist', 'oncologist', 'gynaecologist', 'paediatrician',
    'cardiologist', 'pathologist', 'anaesthetist', 'dentist',
    'neurologist', 'nephrologist', 'obstetrician', 'haematologist',
    'endocrinologist', 'rheumatologist',
  ],

  'other': [
    'farmer', 'gardener', 'sailor', 'explorer', 'holocaust survivor',
    'bookseller', 'antiquities dealer', 'church antiquary',
    'literary agent', 'sportswear designer', 'socialite', 'miner',
    'publican', 'crossword setter', 'lighthouse keeper',
    'beekeeper', 'undertaker', 'auctioneer',
  ],
};

// Build reverse map: role → domain
const DOMAIN_BY_ROLE = {};
for (const [domain, roles] of Object.entries(DOMAIN_TABLE)) {
  for (const r of roles) DOMAIN_BY_ROLE[r] = domain;
}

// Suffix matches: if an unmapped fragment ENDS WITH a known role, treat it
// as that role. "late modernist poet" → "poet". Ordered by length so we
// match the most specific first ("opera singer" before "singer").
const SUFFIX_KEYS = Object.keys(DOMAIN_BY_ROLE).sort((a, b) => b.length - a.length);

// ----------------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------------

export function canonicalise(fieldString) {
  if (!fieldString || typeof fieldString !== 'string') {
    return { roles: [], domains: [], unmatched: [] };
  }

  // Split on "and", commas, semicolons, slashes.
  const fragments = fieldString
    .split(/\s+(?:and|&|;|\/)\s+|\s*,\s*/i)
    .map((s) => s.trim().toLowerCase())
    .map((s) => s.replace(/^(the|a|an)\s+/, ''))
    .filter(Boolean);

  const roles = new Set();
  const unmatched = [];

  for (const raw of fragments) {
    const aliased = ALIASES[raw] ?? raw;

    if (DOMAIN_BY_ROLE[aliased]) {
      roles.add(aliased);
      continue;
    }

    // Suffix match: "Byzantine historian" → "historian"
    const suffix = SUFFIX_KEYS.find((k) => aliased.endsWith(' ' + k) || aliased === k);
    if (suffix) {
      roles.add(suffix);
      continue;
    }

    // Last resort: keep as-is, mark unmatched.
    roles.add(aliased);
    unmatched.push(aliased);
  }

  const domains = new Set();
  for (const r of roles) {
    domains.add(DOMAIN_BY_ROLE[r] ?? 'other');
  }

  return {
    roles: [...roles],
    domains: [...domains],
    unmatched,
  };
}

// Convenience for diagnostic runs — pass a whole list and get a report.
export function audit(fieldStrings) {
  const unmatchedCounts = new Map();
  let totalRoles = 0;
  let matchedRoles = 0;
  for (const f of fieldStrings) {
    const { roles, unmatched } = canonicalise(f);
    totalRoles += roles.length;
    matchedRoles += roles.length - unmatched.length;
    for (const u of unmatched) unmatchedCounts.set(u, (unmatchedCounts.get(u) ?? 0) + 1);
  }
  return {
    totalRoles,
    matchedRoles,
    matchRate: matchedRoles / totalRoles,
    unmatchedTop: [...unmatchedCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40),
  };
}
