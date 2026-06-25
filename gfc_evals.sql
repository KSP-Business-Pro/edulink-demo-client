INSERT INTO public.evaluations (id,matiere_id,session_id,ecole_id,categorie,format,intitule,ponderation)
VALUES
('f4d8f229-dfdb-4800-a8fa-2d48a4c484fb','d66031b6-a712-4f9b-831a-7ea8e2281673','f5ff41d4-9d65-434f-a3a9-f39579252a19','e3b029b5-f98f-4314-9654-054a0dbcfcde','CC','ecrit','Devoir 1',1.0),
('ea8bbc5a-000f-4820-85a5-edee7511d393','d66031b6-a712-4f9b-831a-7ea8e2281673','f5ff41d4-9d65-434f-a3a9-f39579252a19','e3b029b5-f98f-4314-9654-054a0dbcfcde','EXAMEN','ecrit','Examen final',1.0),
('929aa84f-1948-4d13-be32-b0ffb4818624','b06260d3-7692-4ffc-b5d4-fa554807d974','f5ff41d4-9d65-434f-a3a9-f39579252a19','e3b029b5-f98f-4314-9654-054a0dbcfcde','CC','ecrit','Devoir 1',1.0),
('5014d137-c3dc-4525-8aa4-aa61010fc2e1','b06260d3-7692-4ffc-b5d4-fa554807d974','f5ff41d4-9d65-434f-a3a9-f39579252a19','e3b029b5-f98f-4314-9654-054a0dbcfcde','EXAMEN','ecrit','Examen final',1.0),
('b8496f37-f977-4b46-b548-ef403d9bee4f','d12d0d22-8650-463d-ab11-736882f4fd6b','f5ff41d4-9d65-434f-a3a9-f39579252a19','e3b029b5-f98f-4314-9654-054a0dbcfcde','CC','ecrit','Devoir 1',1.0),
('276a3ab9-7937-4f92-b9d8-ef574339aeda','d12d0d22-8650-463d-ab11-736882f4fd6b','f5ff41d4-9d65-434f-a3a9-f39579252a19','e3b029b5-f98f-4314-9654-054a0dbcfcde','EXAMEN','ecrit','Examen final',1.0),
('c4b02b8e-03de-4f7d-81ee-d8e1c5524239','a5549989-db3b-49ba-992b-b6460b0d6d86','f5ff41d4-9d65-434f-a3a9-f39579252a19','e3b029b5-f98f-4314-9654-054a0dbcfcde','CC','ecrit','Devoir 1',1.0),
('f2f25712-5fe9-4058-a3c9-2f477efb00a2','a5549989-db3b-49ba-992b-b6460b0d6d86','f5ff41d4-9d65-434f-a3a9-f39579252a19','e3b029b5-f98f-4314-9654-054a0dbcfcde','EXAMEN','ecrit','Examen final',1.0),
('a2e5b698-2ce7-4bd4-926e-a5bb411598e4','596b1f89-9c0f-43f0-ae7f-936c05ae8cfa','f5ff41d4-9d65-434f-a3a9-f39579252a19','e3b029b5-f98f-4314-9654-054a0dbcfcde','CC','ecrit','Devoir 1',1.0),
('738f5b0b-96fa-4839-81ef-5ca2ed4559aa','596b1f89-9c0f-43f0-ae7f-936c05ae8cfa','f5ff41d4-9d65-434f-a3a9-f39579252a19','e3b029b5-f98f-4314-9654-054a0dbcfcde','EXAMEN','ecrit','Examen final',1.0)
RETURNING id, matiere_id, categorie;