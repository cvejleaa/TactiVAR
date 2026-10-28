// Firebase-projektet (v3.24.3, kamp-id). Web-API-nøglen er offentlig pr. design (den identificerer projektet; adgangen
// afgøres af firestore.rules) – begræns den i Google Cloud Console til Identity Toolkit + tactivar.web.app.
// null = upload er ikke sat op endnu (knappen siger det i stedet for at fejle).
export const FIREBASE = null;   // { apiKey: '…', projectId: 'tactivar' }
