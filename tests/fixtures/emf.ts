import type { Question } from "@/lib/types";

/**
 * The EMF reference corpus, transcribed from `EMF_Analysis.pdf`.
 *
 * That document is an AI-generated topic analysis of the RUET Electromagnetic
 * Fields papers that was then validated across a semester of practical use
 * (ASSUMPTION-004). It is treated here as a field-tested benchmark, not as
 * hand-annotated ground truth: the topic labels and groupings are its own.
 *
 * It exists as a fixture so the analysis engine can be tested against a real
 * corpus with known answers without spending Gemini quota. Phase 6 replaces
 * this as the *pipeline's* benchmark with `data/emf.json`, produced by actually
 * running extraction; the deviation between the two is the measurement
 * TASK-046 records.
 *
 * Marks are `null` throughout because the reference table does not carry a
 * marks column.
 */

/** `[topic, paper label, section, text]` */
type Row = [string, string, string | null, string];

const GAUSS = "Gauss's Law, Divergence & Electric Flux Density (D)";
const E_FIELD = "Electric Field Intensity (E) & Coulomb's Law";
const MAGNETIC = "Magnetic Fields (H/B), Ampere's Law & Biot-Savart Law";
const POTENTIAL = "Electric Potential, Work Done & Energy";
const PLANE_WAVES = "Uniform Plane Waves (Equations, Impedance, Parameters)";
const DIPOLES = "Dipoles (Electric & Magnetic)";
const POLARIZATION = "Polarization, Dielectrics & Boundary Conditions";
const WAVEGUIDES = "Waveguides";
const MISC = "Miscellaneous (Currents, Magnetic Force, Applications)";
const SKIN_DEPTH = "Skin Depth & Lossy Medium";
const REFLECTION = "Reflection & Transmission Coefficients";
const VECTOR_POTENTIAL = "Magnetic Vector Potential (A)";
const MAXWELL = "Maxwell's Equations (Overall / General Forms)";
const OHMS_LAW = "Ohm's Law & Resistance in Electrostatics";
const VELOCITY = "Phase & Group Velocity";
const POYNTING = "Poynting Theorem";
const INDUCTANCE = "Inductance";

const ROWS: Row[] = [
  // --- Gauss's Law, Divergence & Electric Flux Density (D) — 13
  [
    GAUSS,
    "2nd CT",
    "A",
    "What is Gauss's law in electrostatics? A uniform volume charge density of 80 μC/m³ is present throughout the region 8 mm < r < 10 mm. Let ρv = 0 for 0 < r < 8 mm. Find the total charge inside the spherical surface r = 10 mm.",
  ],
  [
    GAUSS,
    "CT2 ECE 3121",
    null,
    "State Gauss's law in electrostatics and show it in integral equation form.",
  ],
  [
    GAUSS,
    "CT2 ECE 3121",
    null,
    "In spherical coordinates, a volume charge density ρv = 10e^(−2r) C/m³ is present. (a) Determine D.",
  ],
  [
    GAUSS,
    "CT2 ECE 3121",
    null,
    "A uniform volume charge density of 80 μC/m³ is present throughout the region 8 mm < r < 10 mm. Let ρv = 0 for 0 < r < 8 mm, find the value of Dr at r = 10 mm.",
  ],
  [
    GAUSS,
    "CT2 ECE 3121",
    null,
    "Spherical surfaces at r = 2, 4, and 6 m carry uniform surface charge densities of 20 nC/m², −4 nC/m², and ρs0, respectively. Find D at r = 1, 3 and 5 m.",
  ],
  [
    GAUSS,
    "CT2 ECE 3121",
    null,
    "Analytically derive the expression of the divergence of a vector (say electric flux density, D) and from it obtain Maxwell's first law for electrostatics.",
  ],
  [
    GAUSS,
    "CT2",
    "B",
    "A spherical capacitor consists of two concentric spheres with the inner sphere of radius a and the outer sphere of radius b. The inner sphere supports a total charge Q C that is uniformly distributed over its surface, whereas the outer sphere supports −Q that is uniformly distributed over its surface. Using Gauss's law, determine the electric field for (i) a < R < b, and (ii) R < a, R > b.",
  ],
  [
    GAUSS,
    "2024 ECE 3121",
    null,
    "What is electric flux density? What properties do the electric flux lines have?",
  ],
  [
    GAUSS,
    "2024 ECE 3121",
    null,
    "State and explain Gauss's law. How can Maxwell's 1st law be obtained from this?",
  ],
  [
    GAUSS,
    "2024 ECE 3121",
    null,
    "For a uniformly charged sphere having radius a with a uniform charge ρv C/m³, determine D everywhere.",
  ],
  [
    GAUSS,
    "2024 EEE 2107",
    null,
    "A vector field D = âR cos²φ / R³ exists in the region between two spherical shells defined by R = 1 mm and R = 2 mm. Evaluate: (i) ∮ D · ds, and (ii) ∫ ∇ · D dv.",
  ],
  [
    GAUSS,
    "2024 EEE 2107",
    null,
    "Write Maxwell's equation for electrostatics that relates electric flux density with charge density. Obtain the equation from Gauss's law.",
  ],
  [
    GAUSS,
    "2024 EEE 2107",
    null,
    "A uniform volume charge density of 80 μC/m³ is present throughout the region 8 mm < r < 10 mm. Let ρv = 0 for 0 < r < 8 mm. Find the total charge inside the spherical surface, r = 10 mm.",
  ],

  // --- Electric Field Intensity (E) & Coulomb's Law — 13
  [
    E_FIELD,
    "CT1",
    "A",
    "Define electric field intensity with expression. State with equations how electric fields depend on the distance from the source charge, due to point charge, line charge, surface charge and volume charge distribution. Write some applications of electrostatics.",
  ],
  [
    E_FIELD,
    "CT1",
    "A",
    "A charge of −1 nC is located at the origin in free space. What charge must be located at (2,0,0) to cause Ex to be zero at (3,1,1)?",
  ],
  [
    E_FIELD,
    "CT1",
    "A",
    "Planes x = 2 and y = −3, respectively, carry charges 10 nC/m² and 15 nC/m². If the line x = 0, z = 2 carries charge 10π nC/m, calculate E at (1,1,−1) due to the three charge distributions.",
  ],
  [
    E_FIELD,
    "CT1",
    "A",
    "A thin cylindrical shell of length 200 m and radius 6.00 cm has a uniform surface charge density of 9.00 nC/m². (i) What is the total charge on the shell? Find the electric field at the following radial distances from the long axis of the cylinder: (ii) 2.00 cm, (iii) 6.10 cm.",
  ],
  [
    E_FIELD,
    "CT1 ECE 3121",
    null,
    "What is Coulomb's law? Using this law, define electric field intensity, E.",
  ],
  [
    E_FIELD,
    "CT1 ECE 3121",
    null,
    "For a line charge of density ρL C/m located in free-space along the z-axis, obtain the expression of the electric field vector in terms of the radial distance along the x-axis.",
  ],
  [
    E_FIELD,
    "CT1 ECE 3121",
    null,
    "A uniform line charge of 2 μC/m is located on the z-axis. Find E in rectangular coordinates at P(1,2,3) if the charge exists from −∞ < z < ∞.",
  ],
  [
    E_FIELD,
    "CT1 ECE 3121",
    null,
    "A charge of −1 nC is located at the origin in free space. What charge must be located at (2,0,0) to cause Ex to be zero at (3,1,1)?",
  ],
  [
    E_FIELD,
    "CT1 ECE 3121",
    null,
    "Planes x = 2 and y = −3, respectively, carry charges 10 nC/m² and 15 nC/m². If the line x = 0, z = 2 carries charge 10π nC/m, calculate E at (1,1,−1) due to the three charge distributions.",
  ],
  [
    E_FIELD,
    "CT2",
    "B",
    "A line charge having a constant charge density ρL C/m extends along the Y-axis from −∞ to +∞. Calculate the E field at a distance along the positive X-axis.",
  ],
  [
    E_FIELD,
    "CT4",
    "B",
    "A thin nonconducting rod of finite length L has a charge q spread uniformly along it. Determine the magnitude of E of the electric field at point P on the perpendicular bisector of the rod.",
  ],
  [
    E_FIELD,
    "2024 ECE 3121",
    null,
    "What do you mean by surface charge? A surface charge density ρs(x,y) is given by ρs(x,y) = 3x² + 4y² − xy C/m². Now, calculate the total charge contained within the area bounded by x = 0 → +a, y = 0 → +a.",
  ],
  [
    E_FIELD,
    "2024 EEE 2107",
    null,
    "A charge density ρs C/m² is uniformly spread over the area of a disk of radius a. Determine the force on a charge q that is placed a distance from the center of the disk and on a line that is perpendicular to the disk.",
  ],

  // --- Magnetic Fields (H/B), Ampere's Law & Biot-Savart Law — 11
  [
    MAGNETIC,
    "CT3",
    "A",
    "An infinitely long conducting filament is placed along the x-axis and carries a current of 1 mA in the âx direction. Find H at (−2,3,4).",
  ],
  [MAGNETIC, "CT4 ECE 3121", null, "What is Biot-Savart Law? Explain it mathematically."],
  [
    MAGNETIC,
    "CT4 ECE 3121",
    null,
    "A filament is formed into a circle of radius b, centered at the origin in the plane z = 0. It carries a current I in the âφ direction. Using Biot-Savart Law, find H at the origin.",
  ],
  [
    MAGNETIC,
    "CT4 ECE 3121",
    null,
    "State Ampere's Circuital law and from it derive Maxwell's curl equation of magnetic fields for the time-varying case.",
  ],
  [MAGNETIC, "CT3", "B", "Prove that ∇ × H = J."],
  [
    MAGNETIC,
    "CT3",
    "B",
    "A current I flows in the inner conductor of an infinitely long coaxial line and returns via the outer conductor. The radius of the inner conductor is a and the inner and outer radii of the outer conductor are b and c respectively. Calculate the magnetic field both inside and outside the conductor.",
  ],
  [MAGNETIC, "2024 ECE 3121", null, "With some application, define magnetic field."],
  [
    MAGNETIC,
    "2024 ECE 3121",
    null,
    "State and explain Ampere's circuital law. How can Maxwell's 3rd equation be obtained from this?",
  ],
  [MAGNETIC, "2024 ECE 3121", null, "What do you mean by Ampere's force law?"],
  [
    MAGNETIC,
    "2024 EEE 2107",
    null,
    "A hollow conducting cylinder has an inner radius a and outer radius b and carries current I along the positive z-direction. Find H inside and outside the hollow conductor.",
  ],
  [
    MAGNETIC,
    "2024 EEE 2107",
    null,
    "Using Ampere's circuital law, obtain Maxwell's curl equation for magnetostatic fields. State with the necessary expression how this curl equation differs in time-varying fields.",
  ],

  // --- Electric Potential, Work Done & Energy — 10
  [
    POTENTIAL,
    "2nd CT",
    "A",
    "Determine the work done in carrying a −2 μC charge from P1(2,1,−1) to P2(8,2,−1) in the field E = yâx + xây (i) along the parabola, (ii) along the straight line joining P1 and P2.",
  ],
  [
    POTENTIAL,
    "CT3 ECE 3121",
    null,
    "Define potential function in electrostatics. Derive its relationship with electric field intensity, E.",
  ],
  [
    POTENTIAL,
    "CT3 ECE 3121",
    null,
    "Show that the potential field of a point charge at a point in the region of electric fields is inversely proportional to the distance between that point and the location of the source charge for the fields.",
  ],
  [
    POTENTIAL,
    "CT3 ECE 3121",
    null,
    "Given that E = (3x² + y)âx + xây kV/m, find the work done in moving a −2 μC charge from (0,5,0) to (2,−1,0) by taking the straight-line path of y = 5 − 3x.",
  ],
  [
    POTENTIAL,
    "CT3 ECE 3121",
    null,
    "If V = 2x² + 6y² V in free space, find the energy stored in a volume defined by −1 ≤ x ≤ 1, −1 ≤ y ≤ 1, and −1 ≤ z ≤ 1.",
  ],
  [
    POTENTIAL,
    "2024 ECE 3121",
    null,
    "Prove that for n point charges whose position vectors are r1, r2, ... rn, the potential at r is V(r) = Q1/(4πε0).",
  ],
  [
    POTENTIAL,
    "2024 ECE 3121",
    null,
    "Prove that the electric field, E can be represented as the gradient of potential.",
  ],
  [
    POTENTIAL,
    "2024 ECE 3121",
    null,
    "Suppose that potential is given as V = (10/r²) sin θ cos φ, then (i) Find the electric flux density D at (2, π/2, 0), (ii) Calculate the work done in moving a 10 μC charge from point L(1, 30°, 120°) to M(4, 90°, 60°).",
  ],
  [
    POTENTIAL,
    "2024 EEE 2107",
    null,
    "A potential function of V = 100 + 50ρ + 150ρ sin φ V exists within a cylinder of ρ = 2, 0 < z < 1. Find the electric flux density D at the point P(1, 60°, 0.5) in free space.",
  ],
  [
    POTENTIAL,
    "2024 EEE 2107",
    null,
    "In free space, let ρv = 200 ε0/r^2.4 C/m³. Use Poisson's equation to find V(r) if it is assumed that r²Er → 0 when r = 0 and V → 0 as r → ∞.",
  ],

  // --- Uniform Plane Waves — 9
  [
    PLANE_WAVES,
    "CT4",
    "A",
    "The E-field of a uniform plane wave propagating in a dielectric medium is given by E(t,z) = 2cos(10⁸t − z/√3)âx − sin(10⁸t − z/√3)ây. (i) What is the dielectric constant of the medium? (ii) Describe the polarization of the wave. (iii) Find the corresponding H-field.",
  ],
  [
    PLANE_WAVES,
    "CT4",
    "A",
    "The instantaneous expression for the magnetic field intensity of a uniform plane wave propagating in the +y direction in air is given by [εr = 80, μr = 1, σ = 4 S/m], H = 0.1 sin(10¹⁰πt − π/3)âx A/m. (i) Determine the attenuation constant, phase constant, intrinsic impedance, and the phase velocity. (ii) Find the location at which the amplitude of H is 0.01 A/m.",
  ],
  [PLANE_WAVES, "CT4", "B", "(ii) Hz = 100 cos(10⁷πt − z/4)âz → z =? → E =?"],
  [
    PLANE_WAVES,
    "CT4 ECE 3121",
    null,
    "In free-space the magnetic field vector of a plane wave is H = 0.1 cos(2 × 10⁸t − kx)ây A/m. Calculate the time t1 it takes the wave to travel a λ/8 distance.",
  ],
  [
    PLANE_WAVES,
    "CT4 ECE 3121",
    null,
    "Define intrinsic impedance of a medium. Show that the electric field vector, E leads the magnetic field vector, H of a plane wave by 45° in a good conductor.",
  ],
  [
    PLANE_WAVES,
    "2024 EEE 2107",
    null,
    "What are the differences while a plane wave is propagating through a perfect dielectric medium versus propagating through a good conducting medium? Explain your answer by writing equations.",
  ],
  [
    PLANE_WAVES,
    "2024 EEE 2107",
    null,
    "Let the fields Ẽ(z,t) = 1800 cos(10⁷πt − βz)âx V/m and H̃(z,t) = 3.8 cos(10⁷πt − βz)ây A/m represent a uniform plane wave propagating at a velocity of 1.4 × 10⁸ m/s in a perfect dielectric. Find (i) β, (ii) λ, (iii) η, (iv) μr, and (v) εr.",
  ],
  [
    PLANE_WAVES,
    "2024 EEE 2107",
    null,
    "Derive the wave equation for the electric field in free space.",
  ],
  [
    PLANE_WAVES,
    "2024 EEE 2107",
    null,
    "The Ẽ field of a uniform plane wave propagating in a dielectric medium is given by Ẽ(z,t) = âx 2cos(10⁸t − z/√3) − ây sin(10⁸t − z/√3) V/m. (i) Determine the frequency and wavelength of the wave. (ii) What is the dielectric constant of the medium? (iii) Describe the polarization of the wave. (iv) Find the corresponding H̃ field.",
  ],

  // --- Dipoles (Electric & Magnetic) — 8
  [DIPOLES, "CT3", "A", "Define magnetic dipole and magnetic dipole moment."],
  [
    DIPOLES,
    "CT2",
    "B",
    "Define electric dipole. Prove that an electric dipole has the following electric field, E = P/(4πε0R³) (2cos θ âR + sin θ âθ).",
  ],
  [
    DIPOLES,
    "CT4",
    "B",
    "The following figure shows an electric quadrupole. It consists of two dipole moments that are equal in magnitude but opposite in direction. Show that the value of E on the axis of the quadrupole for points a distance z from its center (assume z ≫ d) is given by E = 3Q/(4πε0z⁴).",
  ],
  [
    DIPOLES,
    "CT3",
    "B",
    "Find the magnetic flux density at a distant point of a small circular loop of radius b that carries current I.",
  ],
  [
    DIPOLES,
    "CT3",
    "B",
    "Define magnetic vector potential and magnetic dipole. Prove that ∇ × H = J.",
  ],
  [
    DIPOLES,
    "CT3 ECE 3121",
    null,
    "State electric dipole with a sketching figure. What is dipole moment?",
  ],
  [DIPOLES, "2024 ECE 3121", null, "What is an electric dipole?"],
  [
    DIPOLES,
    "2024 EEE 2107",
    null,
    "In what ways does the electric field intensity vary with distance for (i) a point charge and (ii) an electric dipole?",
  ],

  // --- Polarization, Dielectrics & Boundary Conditions — 6
  [
    POLARIZATION,
    "2nd CT",
    "A",
    "What is the polarization vector? Write its expression with unit. Find the dielectric constant of a material in which the electric flux density is four times the polarization.",
  ],
  [POLARIZATION, "CT4", "B", "(i) Conditions of different kind of polarization?"],
  [
    POLARIZATION,
    "2024 ECE 3121",
    null,
    "Derive the boundary condition for stating electric field, when medium 2 is a perfect conductor and medium 1 is a dielectric.",
  ],
  [
    POLARIZATION,
    "2024 ECE 3121",
    null,
    "Describe the phenomena when a dielectric slab is placed between the conducting plates of a parallel plate capacitor.",
  ],
  [
    POLARIZATION,
    "2024 ECE 3121",
    null,
    "A dielectric sphere (εr = 4.7) of radius 10 cm has a point charge 3 pC placed at its center. Calculate: (i) The surface density of polarization charge on the surface of the sphere. (ii) The force exerted by the charge on a −3 pC point charge placed on the sphere.",
  ],
  [
    POLARIZATION,
    "2024 EEE 2107",
    null,
    "What do you understand by polarization vector? Explain writing its equation. Calculate the electric susceptibility of a material in which the electric flux density is 3 times the polarization.",
  ],

  // --- Waveguides — 4
  [
    WAVEGUIDES,
    "2024 EEE 2107",
    null,
    "State how a waveguide differs from free space in case of plane wave propagating through it.",
  ],
  [
    WAVEGUIDES,
    "2024 EEE 2107",
    null,
    "What is an evanescent mode? Discuss the general attenuation behavior caused by wall losses as a function of frequency for the TE10 mode in a rectangular waveguide.",
  ],
  [
    WAVEGUIDES,
    "2024 EEE 2107",
    null,
    "A rectangular waveguide operating at the S band with dimensions a = 7.21 cm and b = 3.40 cm. What mode types can be used to transmit electromagnetic waves having the following wavelengths? (i) λ = 10 cm, (ii) λ = 5 cm.",
  ],
  [
    WAVEGUIDES,
    "2024 EEE 2107",
    null,
    "Calculate and compare the values of β, up, ug, and λg for a 2.5 cm × 1.5 cm rectangular waveguide operating at 7.5 GHz: (i) if the waveguide is hollow, and (ii) if the waveguide is filled with a dielectric medium characterized by εr = 2, μr = 1, σ = 0.",
  ],

  // --- Miscellaneous — 4
  [
    MISC,
    "2024 ECE 3121",
    null,
    "What are the fundamental laws that govern static electric field? For problem solving purpose which law is chosen when?",
  ],
  [
    MISC,
    "2024 ECE 3121",
    null,
    "With suitable examples, define convection and conduction currents.",
  ],
  [
    MISC,
    "2024 ECE 3121",
    null,
    "With the help of the knowledge you have obtained while studying static electric fields, prove that we are safest inside our car during a thunderstorm.",
  ],
  [
    MISC,
    "2024 ECE 3121",
    null,
    "A charged particle of mass 2 kg and 1 C starts at the origin with velocity 3ây m/s and travels in a region of uniform magnetic field B = 10âz Wb/m². At t = 4 s, measure: (i) The velocity and acceleration of the particle. (ii) The magnetic force on it, its K.E., and its location.",
  ],

  // --- Skin Depth & Lossy Medium — 3
  [
    SKIN_DEPTH,
    "CT4",
    "A",
    "Given that the skin depth for graphite at 100 MHz is 0.16 mm, determine (i) the conductivity of graphite and (ii) the distance that a 1 GHz wave travels in graphite such that its field intensity is reduced by 30 dB.",
  ],
  [SKIN_DEPTH, "CT4", "B", "(iii) 100 MHz → 30 dB → σ =? → z =?, 1 GHz skin depth."],
  [
    SKIN_DEPTH,
    "2024 EEE 2107",
    null,
    "A uniform plane wave in a lossy medium has a phase constant of 1.6 rad/m at 10⁷ Hz and its magnitude is reduced by 60% for every 2 m traveled. Find the skin depth and speed of the wave.",
  ],

  // --- Reflection & Transmission Coefficients — 3
  [REFLECTION, "2024 ECE 3121", null, "Prove that 1 + Γ = τ."],
  [
    REFLECTION,
    "2024 EEE 2107",
    null,
    "Define reflection coefficient and transmission coefficient. Deduce the relationship between them.",
  ],
  [
    REFLECTION,
    "2024 EEE 2107",
    null,
    "A uniform plane wave in air is normally incident on an infinitely extended lossless dielectric medium having ε = 3ε0 and μ = μ0. If the incident electric field is Ẽi = 10cos(ωt − z)ây V/m, calculate (i) ω and λ of the wave in both media, (ii) reflection and transmission coefficients.",
  ],

  // --- Magnetic Vector Potential (A) — 3
  [VECTOR_POTENTIAL, "CT3", "B", "Define magnetic vector potential."],
  [
    VECTOR_POTENTIAL,
    "2024 ECE 3121",
    null,
    "Given the magnetic vector potential A = −(ρ²/4)âz Wb/m, calculate the total magnetic flux crossing the surface φ = π/2, 1 m ≤ ρ ≤ 2 m, 0 ≤ z ≤ 5 m.",
  ],
  [
    VECTOR_POTENTIAL,
    "2024 EEE 2107",
    null,
    "Define vector magnetic potential A. What is the relation between magnetic flux density B and vector magnetic potential A? Give an example of a situation in which B is zero and A is not.",
  ],

  // --- Maxwell's Equations — 2
  [
    MAXWELL,
    "2024 ECE 3121",
    null,
    "For an EM field, represent Maxwell's equations along with respective remarks both in point form and integral form.",
  ],
  [
    MAXWELL,
    "2024 ECE 3121",
    null,
    "Point out the differential and integral forms of Maxwell's equations.",
  ],

  // --- Ohm's Law & Resistance in Electrostatics — 2
  [
    OHMS_LAW,
    "2nd CT",
    "A",
    "What is Ohm's law in electrostatics? Using that law, find out the expression of resistance in terms of a conductor's physical property parameters (specific conductivity σ, length L, and cross-sectional area S).",
  ],
  [
    OHMS_LAW,
    "2024 EEE 2107",
    null,
    "Using Ohm's law in electrostatics, derive the expression of resistance of a conductor in terms of its physical properties while carrying current due to an applied uniform electric field.",
  ],

  // --- singletons
  [
    VELOCITY,
    "2024 EEE 2107",
    null,
    "Define phase velocity and group velocity. In what ways is group velocity different from phase velocity?",
  ],
  [
    POYNTING,
    "2024 ECE 3121",
    null,
    "State Poynting's theorem and prove that ∮(E × H) · ds = −∂/∂t ∫[½εE² + ½μH²] dv − ∫σE² dv.",
  ],
  [
    INDUCTANCE,
    "CT3",
    "A",
    "An air coaxial transmission line has a solid inner conductor of radius a and a very thin outer conductor of inner radius b. Determine the inductance per unit length of the line.",
  ],
];

/** Papers labelled "2024 …" are end-of-semester finals; everything else is a class test. */
function paperTypeOf(label: string): "CT" | "Final" {
  return label.startsWith("2024") ? "Final" : "CT";
}

/**
 * The section-only labels ("2nd CT", "CT1"…) come from the ECE 3121 question
 * bank; the reference groups them with the ECE papers.
 */
function courseCodeOf(label: string): string {
  return label.includes("EEE 2107") ? "EEE 2107" : "ECE 3121";
}

const perPaper = new Map<string, number>();

export const EMF_QUESTIONS: Question[] = ROWS.map(
  ([topic, label, section, text]): Question => {
    const n = (perPaper.get(label) ?? 0) + 1;
    perPaper.set(label, n);

    return {
      id: `${label}-q${n}`,
      course: "Electromagnetic Fields and Waves",
      courseCodes: [courseCodeOf(label)],
      paper: {
        type: paperTypeOf(label),
        label,
        section,
        year: label.startsWith("2024") ? 2024 : null,
      },
      qNo: String(n),
      marks: null,
      text,
      topic,
      isNumerical: /\d/.test(text) && /find|calculate|determine|evaluate|compute/i.test(text),
    };
  },
);

/** The three recycled 80 μC/m³ Gauss's-law variants (TEST-003). */
export const GAUSS_80_MICRO = EMF_QUESTIONS.filter((q) =>
  q.text.includes("80 μC/m³"),
);

/** The 3×-versus-4×-polarization pair (TEST-003). */
export const POLARIZATION_PAIR = EMF_QUESTIONS.filter(
  (q) =>
    q.text.includes("times the polarization") ||
    q.text.includes("four times the polarization"),
);
