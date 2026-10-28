import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import { App } from './App'
import './styles/viewer.css'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(<App />)
