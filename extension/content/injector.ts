// Content Script Injector
// This script runs in the extension context and bridges communication
// between the inpage script (window.ethereum) and the background service worker

console.log('Orbit Wallet content script injector loaded')

// Listen for messages from the inpage script
window.addEventListener('message', async (event) => {
  // Only accept messages from same origin
  if (event.source !== window) return

  // Only handle ORBIT_REQUEST messages
  if (event.data.type !== 'ORBIT_REQUEST') return

  const { requestId, method, params, origin } = event.data

  console.log('Content script received request:', method, 'from', origin)

  try {
    // Forward request to background service worker
    const response = await chrome.runtime.sendMessage({
      type: 'RPC_REQUEST',
      request: {
        id: requestId,
        jsonrpc: '2.0',
        method,
        params,
      },
      origin,
    })

    // Send response back to inpage script
    window.postMessage({
      type: 'ORBIT_RESPONSE',
      responseId: requestId,
      result: response.result,
      error: response.error?.message,
    }, '*')
  } catch (error: any) {
    console.error('Error handling request:', error)

    // Send error back to inpage script
    window.postMessage({
      type: 'ORBIT_RESPONSE',
      responseId: requestId,
      error: error.message || 'Unknown error',
    }, '*')
  }
})

// Listen for events from background service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CHAIN_CHANGED') {
    // Forward to inpage script
    window.postMessage({
      type: 'ORBIT_EVENT',
      eventType: 'chainChanged',
      data: message.chainId,
    }, '*')
  } else if (message.type === 'ACCOUNTS_CHANGED') {
    // Forward to inpage script
    window.postMessage({
      type: 'ORBIT_EVENT',
      eventType: 'accountsChanged',
      data: message.accounts,
    }, '*')
  } else if (message.type === 'DISCONNECT') {
    // Forward to inpage script
    window.postMessage({
      type: 'ORBIT_EVENT',
      eventType: 'disconnect',
      data: null,
    }, '*')
  }
})

// Inject the inpage script into the page
function injectInpageScript(): void {
  const script = document.createElement('script')
  script.src = chrome.runtime.getURL('content/inpage.js')
  script.onload = () => {
    // Remove script element after loading (code stays in memory)
    script.remove()
  }
  ;(document.head || document.documentElement).appendChild(script)
}

// Inject as early as possible
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectInpageScript)
} else {
  injectInpageScript()
}

console.log('Orbit Wallet content script injector ready')
