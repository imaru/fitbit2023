const crypto = require('crypto')
const express = require('express')
const fetch = require('node-fetch')

if (require.main === module) {
  main()
}

async function main () {
  try {
    const router = express()
    const verifier = base64UrlEncode(crypto.randomBytes(64)) // <1>
    const challenge = base64UrlEncode(sha256Hash(Buffer.from(verifier))) // <2>

    router.get('/signin', (req, res) => { // <3>
      const search = '?' + new URLSearchParams({
        'client_id': process.env.FITBIT_CLIENT_ID,
        'response_type': 'code',
        'code_challenge': challenge,
        'code_challenge_method': 'S256',
        'scope': 'heartrate',
      })

      const url = 'https://www.fitbit.com/oauth2/authorize' + search
      res.redirect(url)
    })

    router.get('/callback', async (req, res, next) => { // <4>
      try {
        const user = process.env.FITBIT_CLIENT_ID
        const pass = process.env.FITBIT_CLIENT_SECRET
        const credentials = Buffer.from(`${user}:${pass}`).toString('base64')
        const tokenUrl = 'https://api.fitbit.com/oauth2/token'
        const tokenResponse = await fetch(tokenUrl, { // <5>
          method: 'POST',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            'client_id': process.env.FITBIT_CLIENT_ID,
            'code': req.query.code,
            'code_verifier': verifier,
            'grant_type': 'authorization_code',
          }).toString(),
        })

        const tokenBody = await tokenResponse.json()

        if (tokenBody.errors) { // <6>
          console.error(tokenBody.errors[0].message)
          res.status(500).end()
          return
        }

        const userId = '-'
        const date = 'today'
        const detailLevel = '1sec'
        const dataUrl = 'https://api.fitbit.com/' + [
          '1',
          'user',
          userId,
          'activities',
          'heart',
          'date',
          date,
          '1d',
          `${detailLevel}.json`
        ].join('/')

        const dataResponse = await fetch(dataUrl, { // <7>
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${tokenBody['access_token']}`,
          },
        })

        const dataBody = await dataResponse.json()

        if (dataBody.errors) { // <8>
          console.error(dataBody.errors[0].message)
          res.status(500).end()
          return
        }

        res.type('text/plain') // <9>
          .send(JSON.stringify(dataBody, null, 2))
      } catch (err) {
        next(err)
      }
    })

    router.listen(3000)
  } catch (err) {
    console.error(err)
  }
}

function base64UrlEncode (buffer) { // <10>
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function sha256Hash (buffer) { // <11>
  const hash = crypto.createHash('sha256')

  hash.update(buffer)
  return hash.digest()
}