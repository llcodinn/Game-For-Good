# Chinatown Active Catcher: facilitator guide

## Who this programme is for

The proposed group is people who have difficulty with mobility but can climb stairs,
and who often choose activities alone. The purpose is to offer an enjoyable shared
activity, gentle movement and conversation. Being able to climb stairs is not, by
itself, a suitability assessment for a particular movement or for hand weights.
Adapt the session to each participant with the centre's facilitator.

## A 30-minute session before lunch

Schedule the start 30 minutes before the centre's actual lunch time.

| Time | Activity |
| --- | --- |
| First 5 minutes | Welcome, introduce partners, clear the space, set up cameras. |
| Next 5 minutes | Calibrate at a comfortable distance and try the skippable tutorial. |
| Next 15 minutes | Short 60-second rounds, with rests, partner swaps and conversation between rounds. |
| Final 5 minutes | Wind down, check how participants felt and transition to lunch. |

| Day | Suggested variation |
| --- | --- |
| Monday | Fruit collection using gentle hand reaches. |
| Tuesday | Fruit and gentle sideways steps in legs mode. |
| Wednesday | Celebration objects; two players work toward a shared total. |
| Thursday | Comfortable reaches and partner swaps. Optional hand-weight mode only for participants whose facilitator has already agreed its use. |
| Friday | Friendly team challenge, changing partners and celebrating participation. |

These are five variations of this game, not five separately developed games. A centre
can substitute another suitable game on any day. The programme is a proposal, not a
calendar booking or a clinical exercise prescription.

## Play and setup

1. Serve this directory on localhost (for example with VS Code Live Server), or HTTPS.
   Internet access is needed to load the pinned MediaPipe tracking model and optional fonts.
2. Choose one or two players, optional nicknames, movement and difficulty. Everyone collects fruit, with occasional gold celebration bonuses.
3. Connect cameras and allow browser access. Two-player mode requires two distinct
   cameras on the same computer. Point each camera at only its assigned player and
   provide each player with enough physical space. Reconnect after changing cameras.
4. In Hands mode, keep both shoulders and at least one hand visible; hips and feet
   are not required. Legs/Both modes also need hips and at least one ankle (and one hand
   for Both). Hold a comfortable starting position for two seconds. The camera image
   establishes the reference size. Brief tracking gaps under 0.4 seconds do not reset
   calibration progress. The setup checks explain what is missing; there is no separate pairing step.
5. Practise: hands collect through wrist markers; legs collect through ankle markers
   with gentle sideways steps. The practice can be skipped. Scored rounds last 60 seconds.
6. Blue fruit circles give +10. Gold lanterns and red packets activate 2× fruit points
   for 10 seconds for the catching player. Another bonus refreshes (does not stack) the
   timer. The bonus clock pauses with gameplay. Red rotten fruit and bombs still deduct 10.
   Scores never fall below zero. Legs mode has a narrower column and no bombs.
7. Use Pause, Space, or Finish round at any time. Leaving the browser tab pauses a
   scored round; press Resume to continue. Fullscreen hides the surrounding controls.

## Feedback, accessibility and safety limits

- Objects gently pulse once per second during their final 1.8 seconds. A leaving
  label appears too. The steady-warning setting and reduced-motion preference disable
  this pulse. Good items and hazards have different shapes as well as different colours.
- Lost tracking or an apparent move toward the camera automatically pauses both
  players, objects and the clock. Return to the reference position to continue.
- Hands mode uses shoulder width only for the proximity warning; Legs/Both use shoulder width and torso height in
  the image, with an absolute framing check and a calibrated relative-size threshold.
  It does not measure metres, distance to a separate display, or all unsafe positions.
  Camera angle, clothing, occlusion and movement affect it. Keep the camera stationary.
  Recalibrate after changing its position. Verify the warning with the actual equipment
  and participants before relying on it as an activity aid.
- Optional hand-weight mode selects hands/easy and slows the targets. Tracking follows
  wrists, not the weights, and does not assess load or exercise technique. Weights are
  optional; use only an existing facilitator-agreed arrangement. No weight is prescribed.
- Mouse/touch demo is explicitly separate from camera exercise. It has no proximity
  monitoring and its scores appear on a separate board.

## Scores and privacy

Nicknames are optional. The board shows the top 10 for the selected movement,
difficulty, weight setting and input type. Completed rounds count; early endings do
not. Scores are stored locally in the browser, with an in-memory fallback when storage
is unavailable. They are not shared between computers. Camera video is processed in
the browser; this application does not record or upload video. External model and font
files are downloaded from their providers.

## Checks before an in-person session

Run `node --test game-core.test.cjs` for the game-rule regression tests. Manually check
camera permissions, full-body framing, the tutorial, catching, approaching/returning,
tracking loss, pause/resume and two-camera play on the actual setup. Browser automation
and simulated landmarks cannot establish real-world tracking accuracy or suitability.
