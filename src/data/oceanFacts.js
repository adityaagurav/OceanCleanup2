/**
 * oceanFacts.js — Educational Ocean Facts System for OceanCleanup.io.
 *
 * 36 accurate, interesting, kid-friendly facts covering:
 *  - Marine Life (marine_life)
 *  - Ocean Pollution (ocean_pollution)
 *  - Plastic Waste (plastic_waste)
 *  - Recycling (recycling)
 *  - Ocean Ecosystems (ecosystems)
 *  - Ocean Conservation (conservation)
 *
 * Hardcoded dataset: instant load, offline availability, zero API cost.
 * Includes OceanFactsManager with non-repeating shuffle decks for each channel.
 */

export const FACT_CATEGORIES = {
  marine_life: {
    key: 'marine_life',
    label: 'Marine Life',
    emoji: '🐬',
    color: '#57c7e8',
  },
  ocean_pollution: {
    key: 'ocean_pollution',
    label: 'Ocean Pollution',
    emoji: '🌊',
    color: '#f2a33c',
  },
  plastic_waste: {
    key: 'plastic_waste',
    label: 'Plastic Waste',
    emoji: '🥤',
    color: '#e76f51',
  },
  recycling: {
    key: 'recycling',
    label: 'Recycling',
    emoji: '♻️',
    color: '#19b89a',
  },
  ecosystems: {
    key: 'ecosystems',
    label: 'Ocean Ecosystems',
    emoji: '🪸',
    color: '#2a9d8f',
  },
  conservation: {
    key: 'conservation',
    label: 'Conservation',
    emoji: '🛡️',
    color: '#0f86c4',
  },
};

export const OCEAN_FACTS = [
  // ── Category 1: Marine Life ──────────────────────────────────
  {
    id: 'marine-01',
    category: 'marine_life',
    categoryLabel: 'Marine Life',
    emoji: '🐋',
    title: 'Gentle Giants',
    text: 'Blue whales are the largest animals ever known to have lived on Earth—even bigger than the biggest dinosaurs! Their heart is the size of a small car.',
  },
  {
    id: 'marine-02',
    category: 'marine_life',
    categoryLabel: 'Marine Life',
    emoji: '🐢',
    title: 'Ancient Navigators',
    text: 'Sea turtles have crossed oceans for over 100 million years! They use Earth’s magnetic field like an internal compass to return to the beach where they hatched.',
  },
  {
    id: 'marine-03',
    category: 'marine_life',
    categoryLabel: 'Marine Life',
    emoji: '🐙',
    title: 'Nine-Brained Wonders',
    text: 'An octopus has three hearts, blue blood, and nine brains—one central brain and eight mini-brains inside each of its flexible arms!',
  },
  {
    id: 'marine-04',
    category: 'marine_life',
    categoryLabel: 'Marine Life',
    emoji: '🐬',
    title: 'Dolphin Names',
    text: 'Bottlenose dolphins invent unique signature whistles that act just like human names, allowing them to call specific friends across the waves.',
  },
  {
    id: 'marine-05',
    category: 'marine_life',
    categoryLabel: 'Marine Life',
    emoji: '🪼',
    title: 'Timeless Jellies',
    text: 'Jellyfish have drifted through oceans for more than 500 million years. That means they are older than trees, insects, and sharks!',
  },
  {
    id: 'marine-06',
    category: 'marine_life',
    categoryLabel: 'Marine Life',
    emoji: '🦈',
    title: 'Bendy Skeletons',
    text: 'Sharks don’t have a single bone in their bodies! Their skeletons are made of flexible cartilage—the same bendy material in your nose and ears.',
  },

  // ── Category 2: Ocean Pollution ──────────────────────────────
  {
    id: 'pollution-01',
    category: 'ocean_pollution',
    categoryLabel: 'Ocean Pollution',
    emoji: '🌊',
    title: 'The Great Garbage Patch',
    text: 'The Great Pacific Garbage Patch is a giant swirl of floating plastic debris in the ocean that is more than twice the size of Texas!',
  },
  {
    id: 'pollution-02',
    category: 'ocean_pollution',
    categoryLabel: 'Ocean Pollution',
    emoji: '👻',
    title: 'Haunting Ghost Nets',
    text: 'Abandoned fishing nets are called "ghost nets." They can drift unattended for decades, accidentally tangling up sea turtles, fish, and seals.',
  },
  {
    id: 'pollution-03',
    category: 'ocean_pollution',
    categoryLabel: 'Ocean Pollution',
    emoji: '🔬',
    title: 'Microscopic Invaders',
    text: 'Waves and sunlight crumble large plastics into microplastics smaller than a grain of rice, which small sea creatures accidentally mistake for food.',
  },
  {
    id: 'pollution-04',
    category: 'ocean_pollution',
    categoryLabel: 'Ocean Pollution',
    emoji: '🎈',
    title: 'Balloon Danger',
    text: 'When party balloons float away into the sky, they often land in the sea, where sea turtles mistake them for floating jellyfish snacks.',
  },
  {
    id: 'pollution-05',
    category: 'ocean_pollution',
    categoryLabel: 'Ocean Pollution',
    emoji: '🌧️',
    title: 'From Land to Sea',
    text: 'About 80% of all marine pollution begins right on land! Wind and rain sweep street litter and storm drains straight into rivers and the ocean.',
  },
  {
    id: 'pollution-06',
    category: 'ocean_pollution',
    categoryLabel: 'Ocean Pollution',
    emoji: '🛢️',
    title: 'Chemical Runoff',
    text: 'Soap, fertilizers, and car oils washed into roadside drains flow out to sea without treatment, harming delicate baby fish and coral reefs.',
  },

  // ── Category 3: Plastic Waste ────────────────────────────────
  {
    id: 'plastic-01',
    category: 'plastic_waste',
    categoryLabel: 'Plastic Waste',
    emoji: '🥤',
    title: 'Centuries to Disappear',
    text: 'A single plastic bottle can take up to 450 years to break down in the ocean. That is longer than four human lifetimes!',
  },
  {
    id: 'plastic-02',
    category: 'plastic_waste',
    categoryLabel: 'Plastic Waste',
    emoji: '🛍️',
    title: 'The 12-Minute Bag',
    text: 'A plastic grocery bag is used for an average of only 12 minutes, but it can pollute the ocean and endanger marine life for hundreds of years.',
  },
  {
    id: 'plastic-03',
    category: 'plastic_waste',
    categoryLabel: 'Plastic Waste',
    emoji: '🧃',
    title: 'Say No to Straws',
    text: 'Over 500 million plastic straws are thrown away every single day worldwide. Switching to paper or reusable straws protects sea turtles!',
  },
  {
    id: 'plastic-04',
    category: 'plastic_waste',
    categoryLabel: 'Plastic Waste',
    emoji: '🚛',
    title: 'A Truckload a Minute',
    text: 'Worldwide, the equivalent of one full garbage truck filled with plastic waste enters our oceans every single minute.',
  },
  {
    id: 'plastic-05',
    category: 'plastic_waste',
    categoryLabel: 'Plastic Waste',
    emoji: '📦',
    title: 'Single-Use Packaging',
    text: 'Around 40% of all plastic produced worldwide is designed for single-use packaging that is thrown away immediately after opening.',
  },
  {
    id: 'plastic-06',
    category: 'plastic_waste',
    categoryLabel: 'Plastic Waste',
    emoji: '☕',
    title: 'Sneaky Cup Liners',
    text: 'Many paper takeaway cups are lined with a hidden thin plastic coating to stop leaks, making them tricky to recycle in standard paper bins.',
  },

  // ── Category 4: Recycling ────────────────────────────────────
  {
    id: 'recycling-01',
    category: 'recycling',
    categoryLabel: 'Recycling',
    emoji: '💡',
    title: 'Power in a Bottle',
    text: 'Recycling just one plastic bottle saves enough electrical energy to power a bright LED lamp for over 3 hours!',
  },
  {
    id: 'recycling-02',
    category: 'recycling',
    categoryLabel: 'Recycling',
    emoji: '👕',
    title: 'Bottles Become Clothes',
    text: 'Did you know five recycled soda bottles can be melted and spun into enough soft fabric to make a brand-new sports T-shirt?',
  },
  {
    id: 'recycling-03',
    category: 'recycling',
    categoryLabel: 'Recycling',
    emoji: '🥫',
    title: 'Infinite Cans',
    text: 'Aluminum cans can be recycled forever without losing strength! A recycled soda can can return to grocery store shelves in just 60 days.',
  },
  {
    id: 'recycling-04',
    category: 'recycling',
    categoryLabel: 'Recycling',
    emoji: '🛝',
    title: 'Playgrounds from Plastic',
    text: 'Recycled milk jugs and bottles are shredded into heavy-duty plastic lumber used to build park benches, slides, and even boat docks!',
  },
  {
    id: 'recycling-05',
    category: 'recycling',
    categoryLabel: 'Recycling',
    emoji: '📉',
    title: 'Cutting Emissions',
    text: 'Making products from recycled plastic uses up to 70% less energy than creating fresh plastic from raw petroleum oil!',
  },
  {
    id: 'recycling-06',
    category: 'recycling',
    categoryLabel: 'Recycling',
    emoji: '👟',
    title: 'Ocean Plastic Shoes',
    text: 'Leading sportswear companies now weave running shoes and backpacks using yarn made from recycled beach plastic and recovered nets!',
  },

  // ── Category 5: Ocean Ecosystems ─────────────────────────────
  {
    id: 'ecosystem-01',
    category: 'ecosystems',
    categoryLabel: 'Ocean Ecosystems',
    emoji: '🪸',
    title: 'Rainforests of the Sea',
    text: 'Coral reefs cover less than 1% of the seabed, yet they provide a home and nursery for 25% of all marine species on the planet!',
  },
  {
    id: 'ecosystem-02',
    category: 'ecosystems',
    categoryLabel: 'Ocean Ecosystems',
    emoji: '🌲',
    title: 'Underwater Giant Kelp',
    text: 'Giant kelp seaweeds can grow up to 2 feet (60 centimeters) in a single sunny day, creating towering underwater forests for sea otters.',
  },
  {
    id: 'ecosystem-03',
    category: 'ecosystems',
    categoryLabel: 'Ocean Ecosystems',
    emoji: '🫁',
    title: 'Earth’s Blue Lungs',
    text: 'Tiny floating marine plants called phytoplankton generate over 50% of Earth’s oxygen—more than all the world’s rainforests combined!',
  },
  {
    id: 'ecosystem-04',
    category: 'ecosystems',
    categoryLabel: 'Ocean Ecosystems',
    emoji: '🌊',
    title: 'The Deepest Abyss',
    text: 'The Mariana Trench plunges nearly 11 kilometers (36,000 feet) into darkness. If Mount Everest were placed inside, its peak would still be underwater!',
  },
  {
    id: 'ecosystem-05',
    category: 'ecosystems',
    categoryLabel: 'Ocean Ecosystems',
    emoji: '🦀',
    title: 'Mangrove Super-Roots',
    text: 'Mangrove trees thrive in salty coastal waters. Their stilt-like roots trap trash before it reaches coral reefs and shield shores from storm waves.',
  },
  {
    id: 'ecosystem-06',
    category: 'ecosystems',
    categoryLabel: 'Ocean Ecosystems',
    emoji: '🪨',
    title: 'Tide Pool Communities',
    text: 'Tide pools are dynamic saltwater nurseries where colorful starfish, sea anemones, and crabs cling tight to rocks through crashing waves.',
  },

  // ── Category 6: Conservation ─────────────────────────────────
  {
    id: 'conservation-01',
    category: 'conservation',
    categoryLabel: 'Conservation',
    emoji: '🛥️',
    title: 'Solar Interceptor Boats',
    text: 'Autonomous solar-powered cleanup vessels patrol polluted river mouths to catch drifting trash before it can ever reach the open ocean!',
  },
  {
    id: 'conservation-02',
    category: 'conservation',
    categoryLabel: 'Conservation',
    emoji: '🏖️',
    title: 'Beach Cleanup Power',
    text: 'Volunteer beach cleanup crews around the world remove millions of pounds of litter every year, keeping shorelines safe for wildlife.',
  },
  {
    id: 'conservation-03',
    category: 'conservation',
    categoryLabel: 'Conservation',
    emoji: '🧴',
    title: 'Refill Revolution',
    text: 'Carrying a reusable water bottle stops an average of 150 single-use plastic bottles from polluting landfills and oceans each year!',
  },
  {
    id: 'conservation-04',
    category: 'conservation',
    categoryLabel: 'Conservation',
    emoji: '🛡️',
    title: 'Ocean Sanctuaries',
    text: 'Marine Protected Areas are underwater national parks where hunting and pollution are restricted so marine animals can recover and thrive.',
  },
  {
    id: 'conservation-05',
    category: 'conservation',
    categoryLabel: 'Conservation',
    emoji: '🚯',
    title: 'The Take-3 Rule',
    text: 'Whenever you visit a beach, lake, or park, pick up three pieces of litter that aren’t yours. Small actions by many people create huge change!',
  },
  {
    id: 'conservation-06',
    category: 'conservation',
    categoryLabel: 'Conservation',
    emoji: '🌏',
    title: 'All Waters Connect',
    text: 'No matter how far you live from the coast, all storm drains and creeks connect to rivers that lead directly to our one shared ocean!',
  },
];

/**
 * OceanFactsManager maintains non-repeating shuffle decks for each channel.
 * A channel can be 'gameplay', 'harbor', 'recycling', etc.
 * Guarantees that:
 * 1. Every fact in the pool is shown before repeating.
 * 2. When reshuffling, the first fact of a new cycle is not the same as the last fact.
 */
export class OceanFactsManager {
  constructor(facts = OCEAN_FACTS) {
    this.facts = facts;
    this.factsById = new Map(facts.map(f => [f.id, f]));
    this.decks = {};
  }

  _getDeck(channel, categoryFilter = null) {
    if (!this.decks[channel]) {
      this.decks[channel] = {
        remaining: [],
        lastId: null,
      };
    }
    const deck = this.decks[channel];
    if (deck.remaining.length === 0) {
      let pool = this.facts;
      if (categoryFilter) {
        const filterSet = Array.isArray(categoryFilter)
          ? new Set(categoryFilter)
          : new Set([categoryFilter]);
        pool = pool.filter(f => filterSet.has(f.category));
      }
      // Shuffle pool ids with Fisher-Yates algorithm
      const ids = pool.map(f => f.id);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      // Avoid immediate repetition across shuffle cycles (items are popped from the end)
      const lastIndex = ids.length - 1;
      if (deck.lastId && ids.length > 1 && ids[lastIndex] === deck.lastId) {
        const swapIdx = Math.floor(Math.random() * (ids.length - 1));
        [ids[lastIndex], ids[swapIdx]] = [ids[swapIdx], ids[lastIndex]];
      }
      deck.remaining = ids;
    }
    return deck;
  }

  /**
   * Get the next fact for a channel, cycling without frequent repetition.
   * @param {string} channel
   * @param {string[]|string|null} categoryFilter
   * @returns {object} Fact object
   */
  getNextFact(channel = 'gameplay', categoryFilter = null) {
    const deck = this._getDeck(channel, categoryFilter);
    if (deck.remaining.length === 0) return null;
    const nextId = deck.remaining.pop();
    deck.lastId = nextId;
    return this.factsById.get(nextId);
  }

  /** Random fact for non-intrusive gameplay popup (all categories). */
  getGameplayFact() {
    return this.getNextFact('gameplay');
  }

  /** Rotating fact for the harbor board (all educational categories). */
  getHarborFact() {
    return this.getNextFact('harbor');
  }

  /** Relevant waste/pollution/recycling fact after unloading collected trash. */
  getRecyclingFact() {
    return this.getNextFact('recycling', ['recycling', 'plastic_waste', 'ocean_pollution']);
  }

  /** Retrieve fact by ID. */
  getFactById(id) {
    return this.factsById.get(id) || null;
  }

  /** Return list of all facts. */
  getAllFacts() {
    return [...this.facts];
  }

  /** Return facts belonging to a specific category. */
  getFactsByCategory(category) {
    return this.facts.filter(f => f.category === category);
  }

  /** Reset a channel or all channels. */
  reset(channel = null) {
    if (channel) {
      delete this.decks[channel];
    } else {
      this.decks = {};
    }
  }
}

// Global shared singleton
export const oceanFactsManager = new OceanFactsManager();

