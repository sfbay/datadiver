import { createRoot } from 'react-dom/client'
// Self-hosted fonts (Fontsource) — replaces the Google Fonts CDN <link>.
// `full` carries BOTH the opsz (optical-size) and wght axes; single-axis
// files would pin one and lose optical sizing or the 300–700 weight range.
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'
import '@fontsource-variable/roboto-serif/full.css'
import '@fontsource-variable/roboto-serif/full-italic.css'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/400-italic.css'
import '@fontsource/space-mono/700.css'
import '@fontsource/space-mono/700-italic.css'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <App />,
)
