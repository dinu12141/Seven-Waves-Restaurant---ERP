// Register global directives
import { vFitText } from 'src/directives/fitText'

export default ({ app }) => {
  app.directive('fit-text', vFitText)
}
