/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Contact: tsidi@prudenceehs.com
 *
 * App root. Slim shell (Phase 1c): renders the mobile app surface. The
 * desktop marketing landing and (Phase 5) auth gate are decided inside
 * MobileApp via useMediaQuery; this root will host the AuthContext provider
 * once accounts land.
 */

import MobileApp from './components/MobileApp'

export default function App() {
  return <MobileApp />
}
