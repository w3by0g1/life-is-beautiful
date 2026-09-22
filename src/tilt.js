// How a phone is tilted, for steering the light with the gyroscope.
//
// Tilt is measured from how the phone is usually held: the first reading sets
// that, and it slowly follows the phone (over RECENTRE seconds), so holding it
// at any comfortable angle is "level" and only tipping it steers. Readings are
// turned with the screen, so tipping the screen's right edge down is always +x
// and tipping its top edge up is always +y, portrait or landscape.
//
// Phones only report tilt to secure (https) pages, and iPhones only after the
// visitor allows it: the permission prompt is asked for on the first tap (it
// has to come from a tap). Until then, or where there's no gyroscope, `active`
// stays false.

// Seconds for "level" to catch up with how the phone is being held.
const RECENTRE = 6

export function createTilt() {
  const tilt = { active: false, x: 0, y: 0, dispose() {} }
  const supported =
    typeof DeviceOrientationEvent !== 'undefined' && window.isSecureContext && matchMedia('(pointer: coarse)').matches
  if (!supported) return tilt

  let level = null
  let lastT = 0
  const onOrientation = (e) => {
    if (e.beta == null || e.gamma == null) return
    const a = ((screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI) / 180
    const x = e.gamma * Math.cos(a) - e.beta * Math.sin(a)
    const y = e.gamma * Math.sin(a) + e.beta * Math.cos(a)
    if (!level) level = { x, y }
    else {
      const k = 1 - Math.exp(-Math.min(1, (e.timeStamp - lastT) / 1000) / RECENTRE)
      level.x += (x - level.x) * k
      level.y += (y - level.y) * k
    }
    lastT = e.timeStamp
    tilt.x = x - level.x
    tilt.y = y - level.y
    tilt.active = true
  }
  const listen = () => addEventListener('deviceorientation', onOrientation)
  // Rotating the phone changes which way is "level".
  const onRotate = () => {
    level = null
  }
  addEventListener('orientationchange', onRotate)

  let asked = false
  const ask = () => {
    if (asked) return
    asked = true
    removeEventListener('touchend', ask)
    removeEventListener('click', ask)
    DeviceOrientationEvent.requestPermission()
      .then((answer) => answer === 'granted' && listen())
      .catch(() => {})
  }
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    addEventListener('touchend', ask)
    addEventListener('click', ask)
  } else {
    listen()
  }

  tilt.dispose = () => {
    removeEventListener('deviceorientation', onOrientation)
    removeEventListener('orientationchange', onRotate)
    removeEventListener('touchend', ask)
    removeEventListener('click', ask)
  }
  return tilt
}
