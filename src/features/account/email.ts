// Correo escrito por la persona. Un correo nunca lleva espacios: el teclado del iPhone y del iPad a
// veces mete uno (por ejemplo, «gmail. com») y el botón quedaba apagado sin explicación. Se quitan
// todos, no solo los de los extremos.
export const cleanEmail = (raw: string) => raw.replace(/\s+/g, '').toLowerCase();

// Algo antes y después de la arroba, y un final de al menos dos letras tras el último punto.
export const isEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$/.test(email);
