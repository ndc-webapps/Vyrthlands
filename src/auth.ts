export type AuthState = 'guest' | 'loggedOut' | 'loggedIn';

export class AuthStore {
  state: AuthState = 'loggedOut';

  loginPlaceholder(): AuthState {
    this.state = 'loggedOut';
    return this.state;
  }

  continueAsGuest(): AuthState {
    this.state = 'guest';
    return this.state;
  }
}
