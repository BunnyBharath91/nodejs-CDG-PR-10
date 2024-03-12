const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const app = express();
app.use(express.json());

let db = null;

const initializeDatabaseAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server is running on http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB ERROR:${error.message}`);
  }
};

initializeDatabaseAndServer();

const convertStateObject = (stateObject) => ({
  stateId: stateObject.state_id,
  stateName: stateObject.state_name,
  population: stateObject.population,
});

const convertDistrictObject = (districtObject) => ({
  districtId: districtObject.district_id,
  districtName: districtObject.district_name,
  stateId: districtObject.state_id,
  cases: districtObject.cases,
  cured: districtObject.cured,
  active: districtObject.active,
  deaths: districtObject.deaths,
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username='${username}'`;
  const dbUser = await db.get(getUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRETE_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwToken;
  const authorizationHeader = request.headers["authorization"];
  if (authorizationHeader !== undefined) {
    jwToken = authorizationHeader.split(" ")[1];
  }

  if (jwToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwToken, "MY_SECRETE_TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `SELECT * FROM state`;
  const statesData = await db.all(getStatesQuery);
  const convertedStatesData = statesData.map((eachItem) =>
    convertStateObject(eachItem)
  );
  response.send(convertedStatesData);
});

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateDataQuery = `SELECT * FROM state WHERE state_id=${stateId}`;
  const stateData = await db.get(getStateDataQuery);
  const updatedStateData = convertStateObject(stateData);
  response.send(updatedStateData);
});

app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const addDistrictQuery = `INSERT INTO district 
   (district_name,state_id,cases,cured,active,deaths) 
   VALUES 
   ('${districtName}',${stateId},${cases},${cured},${active},${deaths})
  `;
  await db.run(addDistrictQuery);
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictDataQuery = `SELECT * FROM district WHERE district_id=${districtId}`;
    const districtData = await db.get(getDistrictDataQuery);
    const updatedDistrictData = convertDistrictObject(districtData);
    response.send(updatedDistrictData);
  }
);

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `DELETE FROM district WHERE district_id=${districtId}`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictQuery = `UPDATE district SET district_name='${districtName}',
    state_id='${stateId}', cases=${cases}, cured=${cured}, active=${active}, deaths=${deaths} 
    WHERE district_id=${districtId};`;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateStatsQuery = `
    SELECT
      SUM(cases),
      SUM(cured),
      SUM(active),
      SUM(deaths)
    FROM
      district
    WHERE
      state_id=${stateId};`;
    const stats = await db.get(getStateStatsQuery);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;
