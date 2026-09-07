import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createFocusTracker,
  updateFocusTracker,
  type FocusTrackingInput,
  type FocusTrackingState,
} from '../src/lib/focusTracking'

function trackingInput(timestampMs: number, overrides: Partial<FocusTrackingInput> = {}): FocusTrackingInput {
  return {
    timestampMs,
    cameraReady: true,
    faceVisible: true,
    attention: 'focused',
    faceCenterX: 0.5,
    faceCenterY: 0.48,
    faceRatio: 0.18,
    headYawScore: 0.05,
    headPitchScore: 0.35,
    blinkScore: 0.05,
    lightingGood: true,
    connectionStable: true,
    documentFocused: true,
    idleSeconds: 1,
    idleThresholdSeconds: 25,
    ...overrides,
  }
}

function feedSamples(
  state: FocusTrackingState,
  startMs: number,
  seconds: number,
  overrides: Partial<FocusTrackingInput> = {},
) {
  let currentState = state
  let summary = updateFocusTracker(currentState, trackingInput(startMs, overrides)).summary

  for (let offset = 0; offset < seconds; offset += 1) {
    const result = updateFocusTracker(currentState, trackingInput(startMs + offset * 1000, overrides))
    currentState = result.state
    summary = result.summary
  }

  return { state: currentState, summary }
}

test('short head turns remain transient to reduce false distraction positives', () => {
  let state = createFocusTracker(0)
  state = feedSamples(state, 0, 9).state

  const result = feedSamples(state, 9000, 2, {
    attention: 'distracted',
    headYawScore: 0.42,
  })

  assert.equal(result.summary.verdict, 'transient')
  assert.equal(result.summary.confirmedDistraction, false)
  assert.equal(result.summary.confirmedAway, false)
  assert.ok(result.summary.score >= 75)
})

test('active writing posture keeps focus usable when the face remains tracked', () => {
  let state = createFocusTracker(0)
  state = feedSamples(state, 0, 9).state

  const writing = feedSamples(state, 9000, 7, {
    attention: 'distracted',
    headYawScore: 0.08,
    headPitchScore: 0.74,
    idleSeconds: 2,
    documentFocused: true,
  })

  assert.equal(writing.summary.confirmedDistraction, false)
  assert.notEqual(writing.summary.verdict, 'distracted')
  assert.ok(writing.summary.score >= 72)
})

test('tab loss sharply lowers focus even when camera tracking is stable', () => {
  let state = createFocusTracker(0)
  state = feedSamples(state, 0, 9).state

  const tabLost = feedSamples(state, 9000, 1, {
    documentFocused: false,
    idleSeconds: 1,
  })

  assert.equal(tabLost.summary.confirmedDistraction, true)
  assert.ok(tabLost.summary.score <= 36)
})

test('idle penalty is moderate with stable camera and stronger when camera is unavailable', () => {
  let stableState = createFocusTracker(0)
  stableState = feedSamples(stableState, 0, 9).state

  const stableIdle = feedSamples(stableState, 9000, 1, {
    idleSeconds: 42,
    idleThresholdSeconds: 25,
  })

  assert.ok(stableIdle.summary.score >= 58)
  assert.ok(stableIdle.summary.score <= 78)

  const noCameraIdle = feedSamples(createFocusTracker(0), 0, 1, {
    cameraReady: false,
    connectionStable: false,
    faceVisible: false,
    attention: 'unsupported',
    faceCenterX: null,
    faceCenterY: null,
    faceRatio: null,
    idleSeconds: 42,
    idleThresholdSeconds: 25,
  })

  assert.equal(noCameraIdle.summary.verdict, 'unreliable')
  assert.ok(noCameraIdle.summary.score <= 52)
})

test('sustained eye closure is treated as a strong focus drop', () => {
  let state = createFocusTracker(0)
  state = feedSamples(state, 0, 9).state

  const eyesClosed = feedSamples(state, 9000, 5, {
    blinkScore: 0.9,
  })

  assert.equal(eyesClosed.summary.verdict, 'distracted')
  assert.equal(eyesClosed.summary.confirmedDistraction, true)
  assert.ok(eyesClosed.summary.score <= 55)
})

test('face absence is confirmed only after sustained missing tracking', () => {
  let state = createFocusTracker(0)
  state = feedSamples(state, 0, 9).state

  const shortAbsence = feedSamples(state, 9000, 4, {
    faceVisible: false,
    attention: 'away',
    faceCenterX: null,
    faceCenterY: null,
    faceRatio: null,
  })

  assert.notEqual(shortAbsence.summary.verdict, 'away')
  assert.equal(shortAbsence.summary.confirmedAway, false)

  const sustainedAbsence = feedSamples(shortAbsence.state, 13000, 4, {
    faceVisible: false,
    attention: 'away',
    faceCenterX: null,
    faceCenterY: null,
    faceRatio: null,
  })

  assert.equal(sustainedAbsence.summary.verdict, 'away')
  assert.equal(sustainedAbsence.summary.confirmedAway, true)
  assert.ok(sustainedAbsence.summary.score <= 25)
})
