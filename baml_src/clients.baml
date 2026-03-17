client<llm> Persona1Router {
  provider openrouter
  options {
    model "openai/gpt-4.1"
    api_key env.OPENROUTER_API_KEY
  }
}
