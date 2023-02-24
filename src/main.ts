import express from "express"

const PORT = 3000

const app = express()

app.get("/api/hello", async (req, res) => {
  res.json({
    message: "Hello nodemon"
  })
})

app.listen(PORT, () => {
  console.log(`Reversi application started: http://localhost:${PORT}`)
})
