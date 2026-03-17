function generator(base) {
  return typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
    ? () => {
        const num = crypto.getRandomValues(new Uint8Array(1))[0];
        return (num >= base ? num % base : num).toString(base);
      }
    : () => Math.floor(Math.random() * base).toString(base);
}

function uid(length = 7, hex = false) {
  return Array.from({ length }, generator(hex ? 16 : 36)).join("");
}

export default uid;
