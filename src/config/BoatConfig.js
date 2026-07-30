/**
 * BoatConfig.js — Configuration constants for the boat controller.
 */
export const BoatConfig = {
  // Movement
  ACCELERATION: 10.0,   // m/s^2
  DECELERATION: 15.0,   // m/s^2 (faster deceleration)
  MAX_SPEED: 8.0,       // m/s (about 18 knots)
  REVERSE_SPEED: 3.0,   // m/s
  TURN_SPEED: 2.0,      // radians per second at max speed

  // Bobbing effect (optional)
  BOB_SPEED: 0.5,       // radians per second
  BOB_AMOUNT: 0.2,      // meters
};