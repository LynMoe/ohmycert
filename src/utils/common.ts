export const escapeString = (str: string, regex: RegExp) => {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (regex.test(char as string)) {
      result += char;
    }
  }
  return result;
};
