import { useCallback, useEffect, useRef, useState } from 'react';
import { Accelerometer, Gyroscope, type AccelerometerMeasurement, type GyroscopeMeasurement } from 'expo-sensors';
import type { Settings } from '@/types/game';

/**
 * Complementary filter: the accelerometer supplies the stable gravity angle and
 * the gyro supplies quick response. The gyro is never treated as an angle alone.
 */
export function useTiltControl(enabled: boolean, settings: Settings) {
  const acceleration = useRef<AccelerometerMeasurement>({ x: 0, y: 0, z: 0, timestamp: 0 });
  const gyro = useRef<GyroscopeMeasurement>({ x: 0, y: 0, z: 0, timestamp: 0 });
  const tilt = useRef(0);
  const rawTilt = useRef(0);
  const lastSample = useRef(Date.now());
  const dodgeDirection = useRef(0);
  const lastDodgeAt = useRef(0);
  const dodgeArmed = useRef(true);
  const [sensorAvailable, setSensorAvailable] = useState(false);
  const [gyroAvailable, setGyroAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let accelerometerSubscription: ReturnType<typeof Accelerometer.addListener> | undefined;
    let gyroSubscription: ReturnType<typeof Gyroscope.addListener> | undefined;
    let alive = true;
    void (async () => {
      const [accelerometerOK, gyroOK] = await Promise.all([
        Accelerometer.isAvailableAsync(),
        Gyroscope.isAvailableAsync(),
      ]);
      if (!alive) return;
      setSensorAvailable(accelerometerOK);
      setGyroAvailable(gyroOK);
      if (accelerometerOK) {
        Accelerometer.setUpdateInterval(33);
        accelerometerSubscription = Accelerometer.addListener((sample) => {
          const now = Date.now();
          const dt = Math.min(0.08, Math.max(0.01, (now - lastSample.current) / 1000));
          lastSample.current = now;
          acceleration.current = sample;
          // In portrait, x describes left/right gravity. Subtract the persisted neutral hold.
          const gravityTilt = sample.x - settings.calibration;
          const gyroPrediction = rawTilt.current + gyro.current.y * dt;
          rawTilt.current = gyroOK ? 0.94 * gyroPrediction + 0.06 * gravityTilt : gravityTilt;
          // Smooth sensor noise before handing it to the game loop.
          tilt.current = tilt.current * 0.8 + rawTilt.current * 0.2;
        });
      }
      // Gyro Dodge works independently from the accelerometer tilt control.
      if (gyroOK) {
        Gyroscope.setUpdateInterval(33);
        gyroSubscription = Gyroscope.addListener((sample) => {
          gyro.current = sample;
          // Require a fresh flick after the phone returns near neutral so a
          // sustained roll cannot repeatedly queue dodge events.
          const rollRate = Math.abs(sample.y);
          if (rollRate <= 0.75) dodgeArmed.current = true;
          if (dodgeArmed.current && rollRate >= 1.8 && Date.now() - lastDodgeAt.current > 650) {
            dodgeDirection.current = sample.y > 0 ? 1 : -1;
            lastDodgeAt.current = Date.now();
            dodgeArmed.current = false;
          }
        });
      }
    })();
    return () => {
      alive = false;
      accelerometerSubscription?.remove();
      gyroSubscription?.remove();
    };
  }, [enabled, settings.calibration]);

  const calibrate = useCallback(() => {
    // Discard the filter's previous prediction when the player chooses a new
    // neutral hold. The next samples are then relative to this exact position.
    rawTilt.current = 0;
    tilt.current = 0;
    gyro.current = { x: 0, y: 0, z: 0, timestamp: Date.now() };
    lastSample.current = Date.now();
    dodgeDirection.current = 0;
    dodgeArmed.current = true;
    lastDodgeAt.current = 0;
    return acceleration.current.x;
  }, []);
  const getTilt = useCallback(() => tilt.current, []);
  const consumeDodge = useCallback(() => {
    const direction = dodgeDirection.current;
    dodgeDirection.current = 0;
    return direction;
  }, []);
  return { getTilt, consumeDodge, calibrate, sensorAvailable, gyroAvailable };
}
