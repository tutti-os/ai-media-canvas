export class ApiApplicationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiApplicationError";
    this.code = code;
  }
}
