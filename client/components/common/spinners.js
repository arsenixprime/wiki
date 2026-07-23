// Shared registry of the bundled epic-spinners presets, used by the page
// save/load animation (loader.vue, nav-header.vue) and the admin preview.
// Each preset component accepts `color`, `size` and `animation-duration` props.
import {
  AtomSpinner,
  BreedingRhombusSpinner,
  CirclesToRhombusesSpinner,
  FingerprintSpinner,
  FlowerSpinner,
  FulfillingBouncingCircleSpinner,
  FulfillingSquareSpinner,
  HalfCircleSpinner,
  HollowDotsSpinner,
  IntersectingCirclesSpinner,
  LoopingRhombusesSpinner,
  OrbitSpinner,
  PixelSpinner,
  RadarSpinner,
  ScalingSquaresSpinner,
  SelfBuildingSquareSpinner,
  SemipolarSpinner,
  SpringSpinner,
  SwappingSquaresSpinner,
  TrinityRingsSpinner
} from 'epic-spinners'

// key -> component. Keys are stable, lowercase, and stored in site config.
export const spinnerComponents = {
  atom: AtomSpinner,
  'breeding-rhombus': BreedingRhombusSpinner,
  'circles-to-rhombuses': CirclesToRhombusesSpinner,
  fingerprint: FingerprintSpinner,
  flower: FlowerSpinner,
  'fulfilling-bouncing-circle': FulfillingBouncingCircleSpinner,
  'fulfilling-square': FulfillingSquareSpinner,
  'half-circle': HalfCircleSpinner,
  'hollow-dots': HollowDotsSpinner,
  'intersecting-circles': IntersectingCirclesSpinner,
  'looping-rhombuses': LoopingRhombusesSpinner,
  orbit: OrbitSpinner,
  pixel: PixelSpinner,
  radar: RadarSpinner,
  'scaling-squares': ScalingSquaresSpinner,
  'self-building-square': SelfBuildingSquareSpinner,
  semipolar: SemipolarSpinner,
  spring: SpringSpinner,
  'swapping-squares': SwappingSquaresSpinner,
  'trinity-rings': TrinityRingsSpinner
}

// { text, value } list for the admin dropdown.
export const spinnerOptions = [
  { text: 'Atom', value: 'atom' },
  { text: 'Breeding Rhombus', value: 'breeding-rhombus' },
  { text: 'Circles to Rhombuses', value: 'circles-to-rhombuses' },
  { text: 'Fingerprint', value: 'fingerprint' },
  { text: 'Flower', value: 'flower' },
  { text: 'Fulfilling Bouncing Circle', value: 'fulfilling-bouncing-circle' },
  { text: 'Fulfilling Square', value: 'fulfilling-square' },
  { text: 'Half Circle', value: 'half-circle' },
  { text: 'Hollow Dots', value: 'hollow-dots' },
  { text: 'Intersecting Circles', value: 'intersecting-circles' },
  { text: 'Looping Rhombuses', value: 'looping-rhombuses' },
  { text: 'Orbit', value: 'orbit' },
  { text: 'Pixel', value: 'pixel' },
  { text: 'Radar', value: 'radar' },
  { text: 'Scaling Squares', value: 'scaling-squares' },
  { text: 'Self Building Square', value: 'self-building-square' },
  { text: 'Semipolar', value: 'semipolar' },
  { text: 'Spring', value: 'spring' },
  { text: 'Swapping Squares', value: 'swapping-squares' },
  { text: 'Trinity Rings', value: 'trinity-rings' }
]

export const DEFAULT_SPINNER = 'atom'

// Resolve a stored key to a component, falling back to the default.
export function resolveSpinner (key) {
  return spinnerComponents[key] || spinnerComponents[DEFAULT_SPINNER]
}
