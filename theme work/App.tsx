import { useCallback, useState } from 'react'
import { BackgroundAura } from './components/BackgroundAura'
import { DemoDialog } from './components/DemoDialog'
import { FeatureCards } from './components/FeatureCards'
import { Footer } from './components/Footer'
import { Hero } from './components/Hero'
import { Navbar } from './components/Navbar'

export default function App() {
  const [demoOpen, setDemoOpen] = useState(false)
  const openDemo = useCallback(() => setDemoOpen(true), [])
  const closeDemo = useCallback(() => setDemoOpen(false), [])

  return (
    <div id="top" className="relative min-h-svh overflow-x-clip">
      <BackgroundAura />
      <Navbar onBookDemo={openDemo} />
      <main>
        <Hero onBookDemo={openDemo} />
        <FeatureCards />
      </main>
      <Footer />
      <DemoDialog open={demoOpen} onClose={closeDemo} />
    </div>
  )
}
