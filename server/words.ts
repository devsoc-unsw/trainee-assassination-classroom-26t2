// T10: word and category hint content.
//
// SPELLING STANDARD: British/Australian.
//
//   1. Singular, unless the phrase genuinely requires a plural ("scissors").
//      Anything ending in "s" must be listed in ALLOWED_S_ENDINGS below.
//   2. No word with a common alternate spelling. "donut"/"doughnut" and
//      "yo-yo"/"yoyo".
//   3. No word whose drawing reads equally well as a synonym like: "sofa"/"couch" or "bicycle"/"bike".
//   4. No article ("guitar", never "a guitar")
//   5. At least eight words per category.
//   6. No word in two categories.
//

export type Difficulty = "easy" | "medium" | "hard";

export interface WordEntry {
  word: string;
  category: string;
  difficulty: Difficulty;
}

// Words that end in "s" without being plural
export const ALLOWED_S_ENDINGS = new Set([
  "bus",
  "cactus",
  "chess",
  "cross",
  "gymnastics",
  "headphones",
  "moss",
  "octopus",
  "pliers",
  "scissors",
  "tennis",
]);

// Authored grouped by category and difficulty; flattened into WORDS below.
const CATEGORIES: Record<string, Record<Difficulty, string[]>> = {
  "an animal": {
    easy: [
      "cat",
      "dog",
      "elephant",
      "giraffe",
      "penguin",
      "snake",
      "spider",
      "owl",
      "frog",
    ],
    medium: [
      "kangaroo",
      "octopus",
      "snail",
      "squirrel",
      "camel",
      "flamingo",
      "butterfly",
      "whale",
    ],
    hard: ["shark"],
  },
  "a food": {
    easy: [
      "pizza",
      "banana",
      "egg",
      "cheese",
      "carrot",
      "sandwich",
      "strawberry",
      "toast",
    ],
    medium: [
      "pancake",
      "popcorn",
      "sushi",
      "watermelon",
      "mushroom",
      "pineapple",
      "lollipop",
    ],
    hard: ["avocado", "broccoli", "pretzel"],
  },
  "a drink": {
    easy: ["coffee", "tea", "milk", "juice", "beer", "wine"],
    medium: ["milkshake", "lemonade", "smoothie", "cocktail", "champagne"],
    hard: ["hot chocolate"],
  },
  "a plant": {
    easy: ["cactus", "sunflower", "rose", "bamboo"],
    medium: ["fern", "tulip", "seaweed", "ivy", "daisy", "clover", "palm tree"],
    hard: ["moss"],
  },
  "a body part": {
    easy: ["ear", "nose", "knee", "thumb", "tongue", "elbow", "tooth"],
    medium: ["eyebrow", "heart", "brain", "ankle", "shoulder"],
    hard: ["skull", "lung"],
  },
  "an item of clothing": {
    easy: ["hat", "sock", "glove", "belt", "jacket", "boot", "skirt"],
    medium: ["scarf", "tie", "apron", "crown"],
    hard: ["raincoat"],
  },
  "a building": {
    easy: ["castle", "church", "hospital", "barn"],
    medium: [
      "lighthouse",
      "windmill",
      "skyscraper",
      "igloo",
      "library",
      "pyramid",
    ],
    hard: ["stadium", "museum"],
  },
  "a place in nature": {
    easy: ["beach", "cave", "island", "mountain", "desert"],
    medium: ["waterfall", "volcano", "jungle", "canyon", "iceberg"],
    hard: ["swamp", "glacier"],
  },
  "a vehicle": {
    easy: ["bus", "train", "car", "rocket", "tractor"],
    medium: [
      "helicopter",
      "submarine",
      "ambulance",
      "skateboard",
      "scooter",
      "tram",
    ],
    hard: ["unicycle", "wheelbarrow", "forklift"],
  },
  "a musical instrument": {
    easy: ["guitar", "piano", "drum", "violin", "trumpet", "flute"],
    medium: ["harp", "saxophone", "banjo", "tambourine"],
    hard: ["xylophone", "accordion"],
  },
  "a tool": {
    easy: ["hammer", "saw", "ladder", "nail", "scissors"],
    medium: ["screwdriver", "drill", "tape measure", "paintbrush", "pliers"],
    hard: ["chisel", "sandpaper"],
  },
  "a kitchen item": {
    easy: ["fork", "spoon", "oven", "teapot", "kettle"],
    medium: ["whisk", "blender", "rolling pin", "toaster", "microwave"],
    hard: ["grater", "corkscrew"],
  },
  "a piece of furniture": {
    easy: ["chair", "table", "desk", "lamp", "bench"],
    medium: ["stool", "hammock", "mirror", "bunk bed", "drawer"],
    hard: ["rocking chair", "coat rack"],
  },
  "a sport": {
    easy: ["tennis", "boxing", "golf", "basketball", "bowling"],
    medium: ["surfing", "cricket", "archery", "skiing", "netball"],
    hard: ["fencing", "gymnastics"],
  },
  "a job": {
    easy: ["chef", "farmer", "nurse", "clown", "pilot"],
    medium: ["firefighter", "astronaut", "dentist", "plumber", "lifeguard"],
    hard: ["judge", "detective"],
  },
  "a piece of technology": {
    easy: ["laptop", "camera", "robot", "headphones"],
    medium: [
      "printer",
      "satellite",
      "microphone",
      "telescope",
      "drone",
      "calculator",
    ],
    hard: ["smartwatch", "projector"],
  },
  "something in the sky": {
    easy: ["cloud", "moon", "star", "sun", "rainbow"],
    medium: ["lightning", "comet", "planet", "hot air balloon", "parachute"],
    hard: ["eclipse", "constellation"],
  },
  "a toy or game": {
    easy: ["kite", "teddy bear", "balloon", "doll", "slide", "swing"],
    medium: ["chess", "marble", "trampoline", "spinning top"],
    hard: ["rocking horse", "kaleidoscope"],
  },
  "a shape or symbol": {
    easy: ["circle", "square", "triangle", "arrow", "cross", "diamond"],
    medium: ["spiral", "crescent", "hexagon", "question mark"],
    hard: ["cube", "infinity"],
  },
};

export const WORDS: readonly WordEntry[] = Object.entries(CATEGORIES).flatMap(
  ([category, byDifficulty]) =>
    Object.entries(byDifficulty).flatMap(([difficulty, words]) =>
      words.map((word) => ({
        word,
        category,
        difficulty: difficulty as Difficulty,
      })),
    ),
);

export const CATEGORY_HINTS: readonly string[] = Object.keys(CATEGORIES);

export function normaliseWord(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}
