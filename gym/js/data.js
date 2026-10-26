/*
 * Built-in programme and exercise library.
 *
 * Exercise fields
 *   equipment  machine | cable | dumbbell | bodyweight   (used by the library filter)
 *   kind       reps | time                                (time = seconds held, no 1RM)
 *   load       stack | total | per-dumbbell | bodyweight  (what the weight field means)
 *   image      { id, exact }  photo folder in img/ (free-exercise-db, public domain).
 *              exact:false means the photo shows a similar movement, and the UI says so.
 */
(function () {
  const ex = (id, name, equipment, muscles, opts) => Object.assign({
    id, name, equipment, muscles, kind: "reps",
    load: equipment === "dumbbell" ? "per-dumbbell" : equipment === "bodyweight" ? "bodyweight" : "stack",
    image: null, technique: [],
  }, opts);
  const img = (id, exact = true, note) => ({ id, exact, note: note || "" });

  const EXERCISES = [
    // ---------- Day 1
    ex("machine-chest-press", "Machine Chest Press", "machine", ["Chest", "Front delts", "Triceps"], {
      image: img("Leverage_Chest_Press"),
      technique: ["Set the seat so the handles line up with mid-chest.", "Keep shoulder blades pulled back and down against the pad.", "Press until arms are almost straight without locking the elbows.", "Lower under control for about 2 seconds."],
    }),
    ex("db-bench-press", "Dumbbell Bench Press", "dumbbell", ["Chest", "Front delts", "Triceps"], {
      image: img("Dumbbell_Bench_Press"),
      technique: ["Lie flat with feet planted and a slight arch in the upper back.", "Start with dumbbells over the chest, palms facing your feet.", "Lower until elbows are slightly below the bench, about 45° from the body.", "Press up and slightly in; don't clang the dumbbells together."],
    }),
    ex("pec-deck", "Pec Deck / Chest Fly Machine", "machine", ["Chest"], {
      image: img("Butterfly"),
      technique: ["Adjust the seat so handles are at chest height.", "Keep a soft bend in the elbows throughout.", "Bring the handles together by squeezing the chest, not pulling with hands.", "Open slowly until you feel a stretch, not pain, in the chest."],
    }),
    ex("db-chest-fly", "Dumbbell Chest Fly", "dumbbell", ["Chest"], {
      image: img("Dumbbell_Flyes"),
      technique: ["Lie flat with dumbbells above the chest, palms facing each other.", "Keep a fixed, slight elbow bend like hugging a barrel.", "Lower in a wide arc until upper arms are level with the bench.", "Squeeze the chest to bring the weights back up. Use lighter weight than pressing."],
    }),
    ex("machine-shoulder-press", "Machine Shoulder Press", "machine", ["Front delts", "Side delts", "Triceps"], {
      image: img("Leverage_Shoulder_Press"),
      technique: ["Set the seat so handles start at about shoulder height.", "Keep your back and head against the pad and core braced.", "Press overhead until arms are nearly straight.", "Lower until hands are around chin height."],
    }),
    ex("seated-db-shoulder-press", "Seated Dumbbell Shoulder Press", "dumbbell", ["Front delts", "Side delts", "Triceps"], {
      image: img("Dumbbell_Shoulder_Press"),
      technique: ["Sit on an upright bench with back supported.", "Start with dumbbells at shoulder height, palms forward.", "Press up until arms are nearly straight; don't arch the lower back.", "Lower with control back to shoulder height."],
    }),
    ex("machine-lateral-raise", "Machine Lateral Raise", "machine", ["Side delts"], {
      image: img("Cable_Seated_Lateral_Raise", false, "Photo shows a seated cable lateral raise, a similar movement."),
      technique: ["Line up your shoulder joint with the machine's pivot point.", "Lead with the elbows, raising arms out to the side.", "Stop at shoulder height; avoid shrugging.", "Lower slowly, keeping tension on the delts."],
    }),
    ex("db-lateral-raise", "Dumbbell Lateral Raise", "dumbbell", ["Side delts"], {
      image: img("Side_Lateral_Raise"),
      technique: ["Stand tall with a slight forward lean and soft elbows.", "Raise the dumbbells out to the side to shoulder height.", "Think 'pour the jug': lead with elbows, pinkies roughly level with thumbs.", "Lower slowly; avoid swinging the body."],
    }),
    ex("cable-triceps-pushdown", "Cable Triceps Pushdown", "cable", ["Triceps"], {
      image: img("Triceps_Pushdown"),
      technique: ["Stand close to the cable with elbows pinned to your sides.", "Push the bar or rope down until elbows are straight.", "Only the forearms move; shoulders stay still.", "Let the handle rise to about chest height, then repeat."],
    }),
    ex("overhead-db-triceps-ext", "Overhead Dumbbell Triceps Extension", "dumbbell", ["Triceps"], {
      load: "total",
      image: img("Standing_Dumbbell_Triceps_Extension"),
      technique: ["Hold one dumbbell overhead with both hands under the top plate.", "Keep elbows pointing forward and close to the head.", "Lower behind the head until you feel a triceps stretch.", "Extend back to the top without arching the lower back."],
    }),

    // ---------- Day 2
    ex("lat-pulldown", "Lat Pulldown", "cable", ["Lats", "Upper back", "Biceps"], {
      image: img("Wide-Grip_Lat_Pulldown"),
      technique: ["Secure thighs under the pad; grip slightly wider than shoulders.", "Lean back slightly and pull the bar to your upper chest.", "Drive elbows down and back; avoid yanking with the body.", "Let the bar rise slowly until arms are straight."],
    }),
    ex("one-arm-db-row", "One-Arm Dumbbell Row", "dumbbell", ["Lats", "Upper back", "Biceps"], {
      image: img("One-Arm_Dumbbell_Row"),
      technique: ["Support one hand and knee on a bench, back flat.", "Pull the dumbbell toward your hip, elbow close to the body.", "Pause at the top and squeeze the back.", "Lower until the arm is straight. Reps are per side."],
    }),
    ex("seated-row-machine", "Seated Row Machine", "machine", ["Upper back", "Lats", "Biceps"], {
      image: img("Leverage_Iso_Row"),
      technique: ["Set the chest pad so you can just reach the handles with straight arms.", "Sit tall with chest against the pad.", "Pull handles toward your torso, squeezing shoulder blades together.", "Return slowly until arms are straight."],
    }),
    ex("bent-over-db-row", "Bent-Over Dumbbell Row", "dumbbell", ["Upper back", "Lats", "Biceps"], {
      image: img("Bent_Over_Two-Dumbbell_Row"),
      technique: ["Hinge at the hips with a flat back, knees slightly bent.", "Let the dumbbells hang below the shoulders.", "Row both dumbbells toward the lower ribs.", "Lower under control; keep the torso still."],
    }),
    ex("reverse-pec-deck", "Reverse Pec Deck", "machine", ["Rear delts", "Upper back"], {
      image: img("Reverse_Machine_Flyes"),
      technique: ["Face the pad with handles at shoulder height.", "Keep a slight elbow bend and open the arms out wide.", "Squeeze the rear shoulders, not the hands.", "Return slowly without letting the stack touch down."],
    }),
    ex("db-reverse-fly", "Bent-Over Dumbbell Reverse Fly", "dumbbell", ["Rear delts", "Upper back"], {
      image: img("Reverse_Flyes"),
      technique: ["Hinge forward with a flat back, dumbbells hanging below the chest.", "Raise the arms out to the side with soft elbows.", "Stop when arms are level with the torso.", "Lower slowly. Use light weight."],
    }),
    ex("machine-biceps-curl", "Machine Biceps Curl", "machine", ["Biceps"], {
      image: img("Machine_Bicep_Curl"),
      technique: ["Set the seat so the backs of your upper arms sit flat on the pad.", "Line elbows up with the machine pivot.", "Curl the handles up while keeping upper arms on the pad.", "Lower all the way down slowly."],
    }),
    ex("alt-db-curl", "Alternating Dumbbell Curl", "dumbbell", ["Biceps", "Forearms"], {
      image: img("Dumbbell_Alternate_Bicep_Curl"),
      technique: ["Stand tall with elbows by your sides.", "Curl one dumbbell up, turning the palm up as you lift.", "Lower fully, then curl the other arm.", "Avoid swinging; count each arm as one rep or log reps per arm consistently."],
    }),
    ex("cable-face-pull", "Cable Face Pull", "cable", ["Rear delts", "Upper back", "Rotator cuff"], {
      image: img("Face_Pull"),
      technique: ["Set a rope at upper-chest to face height.", "Pull the rope toward your face, splitting the ends apart.", "Finish with elbows high and hands beside the ears.", "Return slowly without leaning back."],
    }),
    ex("db-rear-delt-row", "Dumbbell Rear-Delt Row", "dumbbell", ["Rear delts", "Upper back"], {
      image: img("Barbell_Rear_Delt_Row", false, "Photo shows a barbell rear-delt row; use the same wide-elbow path with dumbbells."),
      technique: ["Hinge forward with a flat back, dumbbells hanging.", "Row with elbows flared wide, about 70–90° from the body.", "Pull toward the upper chest and squeeze the rear shoulders.", "Lower under control."],
    }),

    // ---------- Day 3
    ex("leg-press", "Leg Press", "machine", ["Quads", "Glutes", "Hamstrings"], {
      image: img("Leg_Press"),
      technique: ["Feet shoulder-width on the platform, mid-height.", "Lower until knees are about 90° without the lower back lifting off the pad.", "Push through the whole foot; knees track over toes.", "Don't lock the knees hard at the top."],
    }),
    ex("db-goblet-squat", "Dumbbell Goblet Squat", "dumbbell", ["Quads", "Glutes", "Core"], {
      load: "total",
      image: img("Goblet_Squat", false, "Photo shows a goblet squat with a kettlebell; hold a dumbbell vertically at the chest the same way."),
      technique: ["Hold one dumbbell vertically against your chest.", "Feet slightly wider than shoulders, toes slightly out.", "Sit down between your heels with chest tall.", "Drive up through the whole foot."],
    }),
    ex("seated-leg-curl", "Seated Leg Curl", "machine", ["Hamstrings"], {
      image: img("Seated_Leg_Curl"),
      technique: ["Line knees up with the machine pivot; lap pad snug.", "Curl heels down and back as far as comfortable.", "Pause briefly, then return slowly.", "Keep hips on the seat throughout."],
    }),
    ex("db-romanian-deadlift", "Dumbbell Romanian Deadlift", "dumbbell", ["Hamstrings", "Glutes", "Lower back"], {
      image: img("Stiff-Legged_Dumbbell_Deadlift", false, "Photo shows a stiff-legged dumbbell deadlift; for a Romanian deadlift keep a slightly softer knee bend."),
      technique: ["Stand with dumbbells in front of the thighs, knees softly bent.", "Push hips back, sliding weights down the front of the legs.", "Keep the back flat; stop when you feel a strong hamstring stretch.", "Drive hips forward to stand up."],
    }),
    ex("leg-extension", "Leg Extension", "machine", ["Quads"], {
      image: img("Leg_Extensions"),
      technique: ["Line knees up with the pivot; pad on the lower shin.", "Extend the legs until straight and squeeze the quads.", "Lower under control.", "Hold the handles to keep hips down."],
    }),
    ex("db-step-up", "Dumbbell Step-Ups", "dumbbell", ["Quads", "Glutes"], {
      image: img("Dumbbell_Step_Ups"),
      technique: ["Use a box or bench around knee height.", "Place the whole foot on the box and drive up through that leg.", "Avoid pushing off the bottom foot.", "Step down with control. Reps are per leg."],
    }),
    ex("glute-drive", "Glute Drive / Hip Thrust Machine", "machine", ["Glutes", "Hamstrings"], {
      image: img("Barbell_Hip_Thrust", false, "Photo shows a barbell hip thrust; the machine uses the same hip movement."),
      technique: ["Upper back on the pad, belt or pad across the hips.", "Feet flat, shins vertical at the top.", "Drive hips up until torso and thighs are in line; squeeze glutes.", "Keep ribs down; don't over-arch the lower back."],
    }),
    ex("db-glute-bridge", "Dumbbell Glute Bridge", "dumbbell", ["Glutes", "Hamstrings"], {
      load: "total",
      image: img("Barbell_Glute_Bridge", false, "Photo shows a barbell glute bridge; rest one dumbbell on the hips instead."),
      technique: ["Lie on your back, knees bent, one dumbbell on your hips.", "Drive through the heels to lift hips.", "Squeeze the glutes at the top for a second.", "Lower slowly."],
    }),
    ex("cable-crunch", "Cable Crunch", "cable", ["Abs"], {
      image: img("Cable_Crunch"),
      technique: ["Kneel facing a high cable, rope beside your head.", "Keep hips still and crunch the ribs toward the pelvis.", "Round the spine; don't just hinge at the hips.", "Return slowly to a stretch."],
    }),
    ex("weighted-crunch", "Weighted Crunch", "dumbbell", ["Abs"], {
      load: "total",
      image: img("Weighted_Crunches", false, "Photo shows a weighted crunch variation with a medicine ball; holding a dumbbell or plate on the chest works too."),
      technique: ["Lie on your back, knees bent, weight held on the chest.", "Curl the shoulders off the floor by contracting the abs.", "Exhale at the top, lower slowly.", "Don't pull on your neck."],
    }),

    // ---------- Day 4
    ex("incline-chest-press-machine", "Incline Chest Press Machine", "machine", ["Upper chest", "Front delts", "Triceps"], {
      image: img("Leverage_Incline_Chest_Press"),
      technique: ["Set the seat so handles line up with the upper chest.", "Shoulder blades back and down.", "Press up and forward until arms are nearly straight.", "Lower slowly to a comfortable stretch."],
    }),
    ex("incline-db-press", "Incline Dumbbell Bench Press", "dumbbell", ["Upper chest", "Front delts", "Triceps"], {
      image: img("Incline_Dumbbell_Press"),
      technique: ["Set the bench to about 30°.", "Start with dumbbells over the upper chest.", "Lower to the sides of the upper chest, elbows ~45° from the body.", "Press up and slightly in."],
    }),
    ex("neutral-grip-pulldown", "Neutral-Grip Lat Pulldown", "cable", ["Lats", "Upper back", "Biceps"], {
      image: img("V-Bar_Pulldown"),
      technique: ["Attach a V-handle or neutral-grip bar.", "Lean back slightly and pull the handle to the upper chest.", "Drive elbows down toward the hips.", "Return slowly to a full stretch."],
    }),
    ex("db-pullover", "Dumbbell Pullover", "dumbbell", ["Lats", "Chest"], {
      load: "total",
      image: img("Bent-Arm_Dumbbell_Pullover"),
      technique: ["Lie on a bench holding one dumbbell over the chest with both hands.", "Keep a slight elbow bend and lower the dumbbell behind your head.", "Stop at a comfortable stretch; keep ribs down.", "Pull it back over the chest using the lats."],
    }),
    ex("chest-supported-row-machine", "Chest-Supported Row Machine", "machine", ["Upper back", "Lats", "Rear delts"], {
      image: img("Lying_T-Bar_Row", false, "Photo shows a chest-supported T-bar row machine; seated chest-supported rows use the same pull."),
      technique: ["Chest firmly on the pad.", "Pull handles toward the torso, squeezing shoulder blades together.", "Avoid lifting the chest off the pad.", "Lower until arms are straight."],
    }),
    ex("chest-supported-db-row", "Chest-Supported Dumbbell Row", "dumbbell", ["Upper back", "Lats", "Rear delts"], {
      image: img("Dumbbell_Incline_Row"),
      technique: ["Lie face down on an incline bench (about 30–45°).", "Let dumbbells hang straight down.", "Row toward the lower ribs, squeezing the back.", "Lower slowly to a full stretch."],
    }),
    ex("single-arm-cable-lateral", "Single-Arm Cable Lateral Raise", "cable", ["Side delts"], {
      image: img("Cable_Seated_Lateral_Raise", false, "Photo shows a seated cable lateral raise; the single-arm version is done standing beside a low pulley."),
      technique: ["Stand side-on to a low pulley; hold the handle with the far hand.", "Raise the arm out to the side to shoulder height.", "Keep the torso still; don't lean away excessively.", "Lower slowly. Reps are per side."],
    }),
    ex("one-arm-db-lateral", "One-Arm Dumbbell Lateral Raise", "dumbbell", ["Side delts"], {
      image: img("One-Arm_Side_Laterals"),
      technique: ["Hold a support with the free hand and lean slightly away.", "Raise the dumbbell out to the side to shoulder height.", "Lead with the elbow.", "Lower slowly. Reps are per side."],
    }),
    ex("cable-hammer-curl", "Cable Hammer Curl", "cable", ["Biceps", "Brachialis", "Forearms"], {
      image: img("Cable_Hammer_Curls_-_Rope_Attachment"),
      technique: ["Attach a rope to a low pulley; palms face each other.", "Keep elbows by your sides.", "Curl the rope up toward the shoulders.", "Lower slowly to straight arms."],
    }),
    ex("db-hammer-curl", "Dumbbell Hammer Curl", "dumbbell", ["Biceps", "Brachialis", "Forearms"], {
      image: img("Hammer_Curls"),
      technique: ["Hold dumbbells by your sides, palms facing in.", "Curl up keeping the neutral grip.", "Elbows stay pinned; no swinging.", "Lower under control."],
    }),
    ex("cable-overhead-triceps-ext", "Cable Overhead Triceps Extension", "cable", ["Triceps"], {
      image: img("Cable_Rope_Overhead_Triceps_Extension"),
      technique: ["Face away from the cable holding a rope behind your head.", "Stagger your stance and lean slightly forward.", "Extend arms forward and up until straight.", "Return slowly to a deep triceps stretch."],
    }),
    ex("seated-db-overhead-triceps-ext", "Seated Dumbbell Overhead Triceps Extension", "dumbbell", ["Triceps"], {
      load: "total",
      image: img("Seated_Triceps_Press"),
      technique: ["Sit on a bench with back support, one dumbbell overhead in both hands.", "Lower it behind the head, elbows pointing up.", "Extend back to the top.", "Keep the core braced and back against the pad."],
    }),

    // ---------- Day 5
    ex("hack-squat-machine", "Hack Squat Machine", "machine", ["Quads", "Glutes"], {
      image: img("Hack_Squat"),
      technique: ["Back flat on the pad, shoulders under the pads.", "Feet shoulder-width, mid-platform.", "Lower until thighs are around parallel.", "Push through the whole foot; don't let knees cave in."],
    }),
    ex("calf-raise-machine", "Calf Raise Machine", "machine", ["Calves"], {
      image: img("Standing_Calf_Raises"),
      technique: ["Balls of the feet on the edge of the platform.", "Lower the heels for a full stretch.", "Rise as high as possible and pause briefly.", "Keep knees straight but not locked."],
    }),
    ex("standing-db-calf-raise", "Standing Dumbbell Calf Raise", "dumbbell", ["Calves"], {
      image: img("Standing_Dumbbell_Calf_Raise"),
      technique: ["Hold dumbbells by your sides; stand on a step or plate for range.", "Lower heels slowly to a stretch.", "Rise onto the toes and pause.", "Hold a support with one hand if needed (log weight per dumbbell)."],
    }),
    ex("hip-abductor-machine", "Hip Abductor Machine", "machine", ["Glutes (side)", "Hip abductors"], {
      image: img("Thigh_Abductor"),
      technique: ["Sit tall with pads on the outside of the knees.", "Push the knees out as far as comfortable.", "Pause, then return slowly without the stack touching.", "Lean slightly forward to bias the glutes."],
    }),
    ex("side-lying-hip-abduction", "Side-Lying Hip Abduction or Cable Hip Abduction", "bodyweight", ["Glutes (side)", "Hip abductors"], {
      image: img("Side_Leg_Raises", false, "Photo shows a standing side leg raise, a similar hip abduction movement."),
      technique: ["Lie on your side with legs straight and stacked (or stand side-on to a low cable with an ankle strap).", "Lift the top leg up and slightly back, toes pointing forward.", "Pause, then lower slowly.", "Reps are per side. Log added weight (ankle weight / cable) or leave 0."],
    }),
    ex("forearm-plank", "Forearm Plank", "bodyweight", ["Core", "Abs"], {
      kind: "time",
      image: img("Plank"),
      technique: ["Forearms on the floor, elbows under the shoulders.", "Body in a straight line from head to heels.", "Brace the abs and squeeze the glutes.", "Breathe steadily; stop when form breaks. Log seconds held."],
    }),
    ex("dead-bug", "Dead Bug or Weighted Dead Bug", "bodyweight", ["Core", "Abs"], {
      image: img("Dead_Bug"),
      technique: ["Lie on your back, arms up, hips and knees at 90°.", "Press the lower back into the floor.", "Slowly extend opposite arm and leg, then return.", "Alternate sides. Log added weight (held dumbbell) or 0."],
    }),
  ];

  // Programme: rest is the configured rest in seconds; restLabel keeps the original range text.
  const slot = (id, primary, alt, sets, repsMin, repsMax, rest, restLabel, extra) =>
    Object.assign({ id, primary, alt, sets, repsMin, repsMax, rest, restLabel: restLabel || `${rest} s`, perSide: false }, extra);

  const PROGRAM = [
    { id: "d1", name: "Chest, Shoulders and Triceps", short: "Push", muscles: ["Chest", "Shoulders", "Triceps"], slots: [
      slot("d1s1", "machine-chest-press", "db-bench-press", 3, 8, 12, 90),
      slot("d1s2", "pec-deck", "db-chest-fly", 2, 10, 15, 75, "60–90 s"),
      slot("d1s3", "machine-shoulder-press", "seated-db-shoulder-press", 3, 8, 12, 90),
      slot("d1s4", "machine-lateral-raise", "db-lateral-raise", 2, 12, 15, 60),
      slot("d1s5", "cable-triceps-pushdown", "overhead-db-triceps-ext", 2, 10, 15, 60),
    ] },
    { id: "d2", name: "Back and Biceps", short: "Pull", muscles: ["Back", "Biceps", "Rear delts"], slots: [
      slot("d2s1", "lat-pulldown", "one-arm-db-row", 3, 8, 12, 90),
      slot("d2s2", "seated-row-machine", "bent-over-db-row", 3, 8, 12, 90),
      slot("d2s3", "reverse-pec-deck", "db-reverse-fly", 2, 12, 15, 60),
      slot("d2s4", "machine-biceps-curl", "alt-db-curl", 3, 10, 15, 60),
      slot("d2s5", "cable-face-pull", "db-rear-delt-row", 2, 12, 15, 60),
    ] },
    { id: "d3", name: "Legs and Core", short: "Legs", muscles: ["Quads", "Hamstrings", "Glutes", "Core"], slots: [
      slot("d3s1", "leg-press", "db-goblet-squat", 3, 10, 12, 120),
      slot("d3s2", "seated-leg-curl", "db-romanian-deadlift", 3, 10, 15, 75),
      slot("d3s3", "leg-extension", "db-step-up", 2, 12, 15, 60, "60–75 s"),
      slot("d3s4", "glute-drive", "db-glute-bridge", 2, 10, 15, 90),
      slot("d3s5", "cable-crunch", "weighted-crunch", 2, 12, 15, 60),
    ] },
    { id: "d4", name: "Upper-Body Hypertrophy", short: "Upper", muscles: ["Chest", "Back", "Shoulders", "Arms"], slots: [
      slot("d4s1", "incline-chest-press-machine", "incline-db-press", 3, 8, 12, 90),
      slot("d4s2", "neutral-grip-pulldown", "db-pullover", 3, 10, 12, 90),
      slot("d4s3", "chest-supported-row-machine", "chest-supported-db-row", 2, 10, 12, 75, "75–90 s"),
      slot("d4s4", "single-arm-cable-lateral", "one-arm-db-lateral", 2, 12, 15, 45, "45–60 s", { perSide: true }),
      slot("d4s5", "cable-hammer-curl", "db-hammer-curl", 2, 10, 15, 60),
      slot("d4s6", "cable-overhead-triceps-ext", "seated-db-overhead-triceps-ext", 2, 10, 15, 60),
    ] },
    { id: "d5", name: "Legs, Glutes and Core", short: "Lower", muscles: ["Quads", "Hamstrings", "Glutes", "Calves", "Core"], slots: [
      slot("d5s1", "hack-squat-machine", "db-goblet-squat", 3, 8, 12, 120),
      slot("d5s2", "seated-leg-curl", "db-romanian-deadlift", 3, 10, 15, 75),
      slot("d5s3", "calf-raise-machine", "standing-db-calf-raise", 3, 12, 15, 60),
      slot("d5s4", "hip-abductor-machine", "side-lying-hip-abduction", 2, 12, 15, 60),
      // Plank is held for 20–40 s; the dead bug alternative is counted in reps per side.
      slot("d5s5", "forearm-plank", "dead-bug", 3, 20, 40, 45, "45–60 s", { altRepsMin: 8, altRepsMax: 12, altPerSide: true }),
    ] },
  ];

  const IMAGE_SOURCE = {
    name: "Free Exercise DB",
    url: "https://github.com/yuhonas/free-exercise-db",
    license: "Unlicense (public domain)",
  };

  window.GT_DATA = { EXERCISES, PROGRAM, IMAGE_SOURCE };
})();
