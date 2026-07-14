import { App } from './app/App'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/responsive.css'

const root = document.querySelector<HTMLElement>('#app')
if (root === null) throw new Error('Application root not found.')

new App(root).mount()
