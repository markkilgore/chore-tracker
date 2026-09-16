import { daysBetween, startOfWeek, type ISODate } from "../index";

export type SpeciesTheme = "sharks" | "cats";
export interface SpeciesLesson {
  id: string;
  speciesId: string;
  collectionVersion: 1;
  theme: SpeciesTheme;
  name: string;
  scientificName: string;
  title: string;
  fact: string;
  question: string;
  sourceName: string;
  sourceUrl: string;
}
type Lesson = readonly [title: string, fact: string, question: string];
interface Species {
  id: string;
  theme: SpeciesTheme;
  name: string;
  scientificName: string;
  sourceName: string;
  sourceUrl: string;
  lessons: readonly [Lesson, Lesson, Lesson];
}
const museum = (id: string) => `https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/${id}/`;
const smithsonian = (id: string) => `https://nationalzoo.si.edu/animals/${id}`;
const sanDiego = (id: string) => `https://animals.sandiegozoo.org/animals/${id}`;
function shark(id: string, name: string, scientificName: string, lessons: Species["lessons"], sourceUrl = museum(id), sourceName = "Florida Museum"): Species {
  return { id, name, scientificName, theme: "sharks", lessons, sourceName, sourceUrl };
}
function cat(id: string, name: string, scientificName: string, lessons: Species["lessons"], sourceUrl = smithsonian(id), sourceName = "Smithsonian's National Zoo"): Species {
  return { id, name, scientificName, theme: "cats", lessons, sourceName, sourceUrl };
}

// Original child-friendly summaries of the linked museum, zoo, and NOAA sources.
// Keep the order stable: v1 is a 24-week collection, not a live content feed.
export const SPECIES: readonly Species[] = [
  shark("whale-shark", "Whale shark", "Rhincodon typus", [
    ["A giant with tiny meals", "The whale shark is the biggest living fish. Yet many of its meals are tiny! It takes in water and filters out food such as plankton and fish eggs.", "How can lots of tiny meals feed such a giant?"],
    ["A spotted sea giant", "Look for pale spots and lines on the whale shark's dark back. Its unusual pattern helps us recognize this species, along with its wide, flat head.", "Can you find both spots and lines in the photo?"],
    ["Where is its mouth?", "A whale shark's broad mouth sits near the front of its snout. Water enters through the mouth, while special filtering structures help separate food from the water.", "How is a kitchen strainer a little like a filter feeder?"]
  ]),
  shark("nurse-shark", "Nurse shark", "Ginglymostoma cirratum", [
    ["The night shift", "Nurse sharks are mostly active at night. In daylight, they often rest on sandy bottoms or in rocky hiding places. Many return to a favorite resting spot.", "What does nocturnal mean? Can you name another night animal?"],
    ["Ocean vacuum", "A nurse shark can suck food into its small mouth. Suction helps it gather animals such as small fish and shellfish from the sea floor.", "What is something at home that uses suction?"],
    ["Look for the barbels", "Nurse sharks have two whisker-like structures called barbels near their mouths. They also have rounded fins and small eyes. Those details help identify this shark.", "How is this shark's shape different from a whale shark's?"]
  ]),
  shark("bonnethead", "Bonnethead", "Sphyrna tiburo", [
    ["A shovel-shaped head", "The bonnethead belongs to the hammerhead family, but its head is rounded like a little shovel. Different head shapes help scientists tell hammerhead species apart.", "Draw a shovel shape, then draw a hammer shape. How do they differ?"],
    ["Small shark, big family", "Bonnetheads are among the smaller hammerhead sharks. Adults commonly measure about three to four feet long. Some of their hammerhead relatives grow much larger.", "With a grown-up, measure three feet. Is it taller or shorter than you?"],
    ["Tools in its mouth", "A bonnethead has sharper teeth toward the front and flatter teeth farther back. The flat teeth help grind hard food. Its mouth has different tools for different jobs.", "Which of your teeth are better for biting, and which are better for chewing?"]
  ]),
  shark("zebra-shark", "Zebra shark", "Stegostoma tigrinum", [
    ["Stripes become spots", "Baby zebra sharks have stripes. As they grow, their markings change into spots! Young and adult zebra sharks look so different that people once thought they were different species.", "Would stripes or spots help you recognize a baby zebra shark?"],
    ["A shellfish supper", "Zebra sharks search for food near the sea floor. Their meals include mollusks, a group that includes snails and clams. They are well suited to finding food around coastal reefs.", "Can you name two animals that carry a shell?"],
    ["The same animal, a new look", "A grown zebra shark does not keep its baby stripes. Its spotted coat is a reminder that an animal's appearance can change as it grows, even though it is still the same species.", "What other animals look different as babies and adults?"]
  ]),
  shark("basking-shark", "Basking shark", "Cetorhinus maximus", [
    ["Second-biggest fish", "The basking shark is the world's second-largest living fish, after the whale shark. Despite its enormous size and mouth, it feeds on tiny drifting animals called zooplankton.", "Which is bigger: a basking shark or a whale shark?"],
    ["Swimming with a strainer", "A basking shark swims with its mouth open to gather food. Structures called gill rakers strain small animals from the seawater passing through its gills.", "What would happen if the holes in a strainer were too big?"],
    ["A busy surface swimmer", "Basking sharks are often seen close to the water's surface. They move slowly while feeding where tiny drifting animals are plentiful. A huge mouth does not always mean huge prey!", "Why might a filter feeder follow patches of tiny animals?"]
  ]),
  shark("epaulette-shark", "Epaulette shark", "Hemiscyllium ocellatum", [
    ["A shark that walks", "Epaulette sharks can move along the bottom using their paired fins like little feet. They bend their bodies and swing their fins to make a walking motion.", "Which body parts does this shark use instead of legs?"],
    ["Life in a tide pool", "When the tide goes out, some reef pools have very little oxygen. Epaulette sharks can cope with low oxygen for a time, an unusual skill for life in shallow water.", "Why would changing tides make a tide pool a tricky home?"],
    ["Shoulder spots", "Look for the big black spot just behind the head, above a side fin. A pale border surrounds it. The shark has one on each side, like badges on its shoulders.", "Can you spot the large badge and the smaller body spots?"]
  ]),
  shark("blacktip-reef-shark", "Blacktip reef shark", "Carcharhinus melanopterus", [
    ["Fins dipped in ink", "Look for the dark tips on this shark's fins, with pale patches just below them. Those bold markings help identify a blacktip reef shark among its reef neighbors.", "Can you find a black tip on more than one fin?"],
    ["A familiar neighborhood", "Blacktip reef sharks often stay close to a familiar reef. They prefer shallow, clear water and usually have small home ranges instead of traveling far across the open ocean.", "What might make a reef a good place to call home?"],
    ["Dark above, light below", "A blacktip reef shark has a darker back and a pale underside. This difference is called countershading. Many ocean animals have different colors on their tops and bellies.", "Look at the photo. Where does the darker color meet the lighter color?"]
  ]),
  shark("greenland-shark", "Greenland shark", "Somniosus microcephalus", [
    ["A life measured in centuries", "Scientists estimate that Greenland sharks can live for hundreds of years. Their ages are estimates, not exact birthdays. Studying these sharks helps us learn about very long lives.", "How many years are in one century?"],
    ["A cold, deep home", "Greenland sharks live in cold ocean waters and can travel very deep. NOAA scientists have seen one more than 700 meters below the surface using a remotely operated vehicle.", "Why might scientists send a robot to explore deep water?"],
    ["Science keeps asking why", "One idea is that a Greenland shark's slow metabolism helps it live so long. Metabolism is how a body uses energy. Scientists are still investigating why these sharks live for centuries.", "Why is it useful for scientists to say when an explanation is still an idea?"]
  ], "https://oceanservice.noaa.gov/facts/greenland-shark.html", "NOAA Ocean Service"),
  cat("sand-cat", "Sand cat", "Felis margarita", [
    ["Built-in desert slippers", "Sand cats have thick fur on the bottoms of their feet. It helps protect their paws from hot and cold ground and helps them move over loose sand.", "How are your shoes a little like a sand cat's furry feet?"],
    ["A cool place to rest", "A desert can be very hot in the day and cold at night. Sand cats retreat into burrows when temperatures are extreme. A good hiding place can also be a comfortable home.", "Where could an animal find shade in a desert?"],
    ["Dressed for the desert", "Sand cats have pale, sandy fur, low-set ears and short legs. They live in dry parts of Africa and Asia, including sandy plains and rocky valleys.", "Look at the photo. Which colors also appear in a sandy landscape?"]
  ]),
  cat("fishing-cat", "Fishing cat", "Prionailurus viverrinus", [
    ["A cat that loves a swim", "Fishing cats readily swim and hunt around water. Their front toes are partly webbed, and their claws stick out a little even when pulled back.", "What other animals have webbed feet?"],
    ["A built-in raincoat", "Fishing cats have a dense inner layer of fur that helps keep water away from their skin. Longer outer hairs carry the pattern you can see. Their fur helps them stay warm in water.", "Why is staying dry underneath useful when swimming in chilly water?"],
    ["Spots and stripes", "A fishing cat has dark stripes on its forehead and neck, with spots across much of its body. Its sturdy shape and short tail help distinguish it from other small wild cats.", "Can you find a stripe and a spot in the photo?"]
  ]),
  cat("cheetah", "Cheetah", "Acinonyx jubatus", [
    ["Made for a short sprint", "Cheetahs are the fastest land mammals. Their flexible bodies and long legs help them sprint, but they cannot keep their top speed for very long.", "How is a sprint different from a long-distance run?"],
    ["A tail for turning", "A cheetah's long tail helps balance its body during quick turns. Its paws and partly retractable claws also help it grip the ground while running.", "How do you use your arms to help balance when you turn?"],
    ["The cat that chirps", "Cheetahs do not roar like lions. They can chirp, purr, growl and hiss. A chirp can help cheetahs communicate with each other, including mothers and cubs.", "If you heard a chirp, would you expect a bird or a cat?"]
  ]),
  cat("snow-leopard", "Snow leopard", "Panthera uncia", [
    ["A tail that doubles as a blanket", "A snow leopard's thick tail helps it balance on rocky slopes. It can also wrap the tail around its body for extra warmth. One body part can have more than one job.", "Can you name the tail's two jobs?"],
    ["Mountain snow shoes", "Snow leopards have broad paws with fur underneath. The paws protect their feet and help them grip snowy, rocky ground while walking, climbing and jumping.", "Why would wide, furry paws be useful on snow?"],
    ["The mountain's hidden cat", "A snow leopard's pale gray coat and dark markings help it blend into its mountain home. Camouflage means colors or patterns that make an animal harder to see.", "Which colors would you choose to hide a drawing against gray rocks?"]
  ], sanDiego("snow-leopard"), "San Diego Zoo Wildlife Alliance"),
  cat("clouded-leopard", "Clouded leopard", "Neofelis nebulosa", [
    ["Down a tree, head first", "Clouded leopards are excellent climbers. Special ankle joints and gripping paws let them climb down trees head first, an unusual ability among cats.", "How might strong, flexible feet help an animal climb?"],
    ["A wild cat of its own", "A clouded leopard is its own species, not simply a leopard with different markings. Its short legs, long tail and patterned coat make it a distinctive member of the cat family.", "What details would you use to tell two cat species apart?"],
    ["Paws made for branches", "Clouded leopards have large paws and special footpads that help them grip branches. Their bodies are well suited to moving through a forest's trees.", "How are gripping footpads useful on a narrow branch?"]
  ]),
  cat("tiger", "Tiger", "Panthera tigris", [
    ["Stripes like fingerprints", "Each tiger has its own stripe pattern. Scientists can use those markings to recognize individual tigers in the wild, just as people have different fingerprints.", "Draw two tigers with different stripe patterns."],
    ["A very big swimmer", "Tigers are strong swimmers. They may enter water to cool down, and they can cross rivers. Being a cat does not mean avoiding water!", "Which other cat in our lessons also likes swimming?"],
    ["Hiding in plain sight", "A tiger's stripes help it blend into its surroundings. It often waits quietly before moving. Camouflage can help a large animal stay surprisingly hard to spot.", "How might stripes blend with tall grass and shadows?"]
  ]),
  cat("lion", "Lion", "Panthera leo", [
    ["A family called a pride", "Lions are unusually social cats. They live in groups called prides, where related females raise cubs and often hunt together. Cooperation is part of lion life.", "What is a job your family does better together?"],
    ["A roar that travels", "Lions use roars to communicate and announce their territory. A lion's roar can be heard from several miles away. Both males and females can roar.", "Why might an animal need a sound that travels a long way?"],
    ["Growing into a new coat", "Lion cubs have faint spots that fade as they grow. Adult males usually develop a shaggy mane. A mane's color and length can vary from lion to lion.", "What changes can you name between a lion cub and an adult male?"]
  ]),
  cat("serval", "Serval", "Leptailurus serval", [
    ["Big ears, careful listening", "A serval uses its large ears to listen for small animals hidden in grass. Instead of always giving chase, it may wait, listen, and then pounce.", "Close your eyes for a moment. What quiet sounds can you notice?"],
    ["A remarkable leap", "Servals can leap more than nine feet straight up. Their long legs help them spring into the air, sometimes catching a bird as it flies past.", "With a grown-up, compare nine feet with the height of a doorway."],
    ["A grassy home", "Servals live around well-vegetated streams and rivers in African savannas. They are often active around dawn and dusk, avoiding the hottest part of the day.", "What do we call the times around sunrise and sunset?"]
  ], sanDiego("serval"), "San Diego Zoo Wildlife Alliance")
];

export function speciesTheme(themeKey: string): SpeciesTheme | null {
  return themeKey === "cats" ? "cats" : themeKey === "shark" || themeKey === "shark-dino" ? "sharks" : null;
}
export function weeklySpeciesLesson(themeKey: string, date: ISODate): SpeciesLesson | null {
  const theme = speciesTheme(themeKey);
  if (!theme) return null;
  const collection = SPECIES.filter((species) => species.theme === theme);
  const cycleLength = collection.length * 3;
  const elapsedWeeks = Math.floor(daysBetween("2026-09-13", startOfWeek(date)) / 7);
  const week = ((elapsedWeeks % cycleLength) + cycleLength) % cycleLength;
  const species = collection[week % collection.length];
  const lessonIndex = Math.floor(week / collection.length);
  const [title, fact, question] = species.lessons[lessonIndex];
  return { id: `${species.id}-lesson-${lessonIndex + 1}-v1`, speciesId: species.id, collectionVersion: 1, theme,
    name: species.name, scientificName: species.scientificName, title, fact, question, sourceName: species.sourceName, sourceUrl: species.sourceUrl };
}
export const chartRowsPerPage = (layoutVersion = 1) => layoutVersion >= 2 ? 12 : 18;
