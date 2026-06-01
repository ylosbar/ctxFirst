import Hapi from "@hapi/hapi"

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? "localhost"

const start = async () => {
  const server = Hapi.server({
    port: PORT,
    host: HOST,
    routes: {
      cors: true,
    },
  })

  server.route({
    method: "GET",
    path: "/",
    handler: () => ({ message: "hello world" }),
  })

  server.route({
    method: "POST",
    path: "/webhook",
    options: {
      payload: { maxBytes: 1_048_576 },
    },
    handler: (request, h) => {
      const receivedAt = new Date().toISOString()
      const body = request.payload as unknown
      console.log(
        `[webhook] ${request.method.toUpperCase()} ${request.path} ${JSON.stringify(body)}`,
      )
      return h.response({ ok: true, receivedAt, echo: body }).code(200)
    },
  })

  await server.start()
  console.log(`API listening on ${server.info.uri}`)
}

process.on("unhandledRejection", (err) => {
  console.error(err)
  process.exit(1)
})

start()
