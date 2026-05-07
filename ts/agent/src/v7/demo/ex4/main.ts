import { example } from './example'

example('round1').catch((err) => {
  console.error('Demo ex4 failed:', err)
  process.exit(1)
})
