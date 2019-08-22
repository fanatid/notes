module.exports = (count, parallel, fn) => {
  const labelTime = 'Elapsed time'

  const timerStart = () => console.time(labelTime)
  let timerStop = () => {
    console.timeEnd(labelTime)
    timerStop = () => {}
  }

  function makeCall () {
    count -= 1
    if (count >= 0) fn(makeCall)
    else timerStop()
  }

  timerStart()
  for (let i = 0; i < parallel; ++i) makeCall()
}
