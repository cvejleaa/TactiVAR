// Firebase-projektet (v3.24.3, kamp-id). Web-API-nøglen er offentlig pr. design (den identificerer projektet; adgangen
// afgøres af firestore.rules) – begræns den i Google Cloud Console til Identity Toolkit + tactivar.web.app.
// null = upload er ikke sat op (knappen siger det i stedet for at fejle). Sat op i v3.24.4.
export const FIREBASE = { apiKey: 'AIzaSyDmtS9Gb0_gz6rLr79DjZB699dWC6vl6ho', projectId: 'tactivar' };   // null = slået fra
