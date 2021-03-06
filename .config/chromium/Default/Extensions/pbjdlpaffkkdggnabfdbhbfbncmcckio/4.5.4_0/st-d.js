// message event is the first thing we need to setup a listner for
// don't want the opener to do a random timeout - instead they can listen for
// the ready event
window.onmessage = event => {
    let {data, ports} = event;

    // It's important to have a messageChannel, don't want to interfair
    // with other simultainus downloads
    if (!ports || !ports.length)
        throw new TypeError("Mehhh! You didn't send a messageChannel");

    // Register the worker, then forward the dataChannel to the worker
    // So they can talk directly, so we don't have to be "the middle man" any
    // longer
    navigator.serviceWorker.getRegistration('./').then(swReg => {
        return swReg || navigator.serviceWorker.register('service-worker.js', {scope : './'})
    }).then(swReg => {
        // This sends the message data as well as transferring
        // messageChannel.port2 to the service worker. The service worker can
        // then use the transferred port to reply via postMessage(), which
        // will in turn trigger the onmessage handler on messageChannel.port1.
        let swRegTmp = swReg.installing || swReg.waiting;

        if (swReg.active)
            return swReg.active.postMessage(data, [ports[0]]);

        swRegTmp.onstatechange = () => {
            if (swRegTmp.state === 'activated')
                swReg.active.postMessage(data, [ports[0]])
        }
    })
};
