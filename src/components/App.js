import './App.scss';
import Alert from './Alert';
import ClassroomCode from './ClassroomCode';
import SharePrompt from './SharePrompt';
import Instructions from './Instructions';
import NavBar from './NavBar';
import Network from './Network';
import Prompt from './Prompt';
import Reclassify from './Reclassify';
import SelectRecipe from './SelectRecipe';
import Stats from './Stats';
import TrainedNetwork from './TrainedNetwork';
import gtmTrack from '../helpers/gtmTrack';
import React from 'react';
import { BrowserRouter, Switch, Route } from 'react-router-dom';
import LocalizedStrings from 'react-localization';
import socketClient from 'socket.io-client';

import ingredients from '../ingredients.json';
import classifications from '../classifications.json';
import stringData from '../strings.json';

import { toJSON, fromJSON } from 'flatted';

const strings = new LocalizedStrings(stringData);

export { ingredients, classifications, strings };

const socket = socketClient();
//const socket = socketClient('http://127.0.0.1:8080');

// Classroom code specified in URL
const url = window.location.pathname.split('/');
if (url[1] && !['build', 'trained', 'stats'].includes(url[1])) {
	socket.emit('join-classroom', url[1]);
}

function App(props) {
	const [appData, setAppData] = React.useState({
		connected: false,
		classroom: false,
		userId: false,
	});
	const [classroomCode, setClassroomCode] = React.useState(false);
	const [recipe, setRecipe] = React.useState(new Array(19).fill(0));
	const [recipes, setRecipes] = React.useState([]);
	const [discuss, setDiscuss] = React.useState(true);
	const [classification, setClassification] = React.useState(0);
	const [reclassify, setReclassify] = React.useState(false);
	const [reclassifyTimeout, setReclassifyTimeout] = React.useState(false);
	const [updated, setUpdated] = React.useState(false);
	const [buildNetwork, setBuildNetwork] = React.useState({
		network: false,
		connections: false,
		id: '',
		urlId: '',
		url: '',
		visible: false,
	});
	const [retrievedNetwork, setRetrievedNetwork] = React.useState({
		network: false,
		connections: false,
	});
	const [envVariables, setEnvVariables] = React.useState(false);

	// Load pre-generated recipes
	React.useEffect(() => {
		fetch('/recipes.json')
			.then(function (response) {
				return response.json();
			})
			.then(function (json) {
				// Shuffle recipes
				for (let i = json.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[json[i], json[j]] = [json[j], json[i]];
				}

				setRecipes(json);
			});
	}, []);

	// Receive from socket
	React.useEffect(() => {
		socket.on('connect', () => {
			appData.connected = true;
			setAppData({ ...appData });
		});

		socket.on('disconnect', () => {
			appData.connected = false;
			setAppData({ ...appData });
		});

		socket.on('user-id', (userId) => {
			appData.userId = userId;
			setAppData({ ...appData });
		});

		socket.on('classroom-created', (code) => {
			setClassroomCode(code);
			window.history.pushState('', '', '/' + code);
		});

		socket.on('classroom-joined', (code) => {
			window.history.pushState('', '', '/' + code);
		});

		socket.on('classroom-updated', (classroom) => {
			appData.classroom = classroom;
			setAppData({ ...appData });
		});

		socket.on('error', (error) => {
			alert(error, 'error');
		});
	}, []);

	const onCommand = (command) => {
		switch (command) {
			case 'join-classroom':
				prompt(strings.enterClassroomCode).then((code) => {
					socket.emit('join-classroom', code);
				});
				break;

			case 'leave-classroom':
				appData.classroom = false;
				window.history.pushState('', '', '/');
				setAppData({ ...appData });
				socket.emit('leave-classroom');
				break;

			case 'create-classroom':
				socket.emit('create-classroom');
				break;

			case 'english':
				strings.setLanguage('en');
				setAppData({ ...appData });
				break;

			case 'french':
				strings.setLanguage('fr');
				setAppData({ ...appData });
				break;
		}
	};

	const onChange = (inputs) => {
		setReclassify(false);
		setRecipe(inputs);
		setUpdated(true);

		// Show reclassify dialog after a delay
		if (reclassifyTimeout) {
			clearTimeout(reclassifyTimeout);
		}
		setReclassifyTimeout(setTimeout(() => setReclassify(true), 3000));
	};

	const onPrediction = (output) => {
		setClassification(output);
	};

	const onFindRecipe = (type, discuss = true) => {
		setReclassify(false);
		setUpdated(false);

		// Find first suitable recipe
		if (recipes.length > 0) {
			for (let index = 0; index < recipes.length; index++) {
				if ((!discuss || recipes[index].Discuss === 1) && (type === 'Random' || recipes[index][type] === 1)) {
					const item = recipes.splice(index, 1)[0];
					setRecipe(Object.values(item).slice(0, ingredients.length));

					// Show reclassify dialog after a delay
					if (reclassifyTimeout) {
						clearTimeout(reclassifyTimeout);
					}
					setReclassifyTimeout(setTimeout(() => setReclassify(true), 1000));
					return;
				}
			}
			if (discuss) {
				onFindRecipe(type, false);
			}
		}
	};

	const onSaveRecipe = () => {
		gtmTrack('sec_btn_click', 'Pretrained', 'Save Recipe', '');
		prompt(strings.nameRecipe).then((name) => {
			socket.emit('save-recipe', {
				name: name,
				ingredients: recipe,
				classification: classification,
			});
		});
	};

	const onReclassify = (recipe, reclassification) => {
		if (reclassification < 0) {
			reclassification = classification;
		}
		socket.emit('reclassify-recipe', {
			recipe: recipe,
			original_classification: classification,
			reclassification: reclassification,
		});
		setReclassify(false);
	};

	const retrieveNetwork = (hashID) => {
		checkEnv().then((res) => {
			if (res) {
				socket.emit('retrieve-network', hashID, (response) => {
					let networkInfo = JSON.parse(response);
					const asMap = RecursiveMap.fromJSON(JSON.parse(networkInfo.data));
					const nn = asMap.get('newNetwork');
					setRetrievedNetwork({
						network: nn.network,
						connections: nn.connections,
					});
				});
			}
		});
	};

	//Recursive Map for sharing a network
	class RecursiveMap extends Map {
		static fromJSON(any) {
			return new this(fromJSON(any));
		}
		toJSON() {
			return toJSON([...this.entries()]);
		}
	}

	// Share the network and recieve the URL
	const shareNetwork = (sharing, network = buildNetwork.network, connections = buildNetwork.connections) => {
		if (sharing && envVariables) {
			let d = new Date();

			const recObj = new RecursiveMap();
			recObj.set('newNetwork', {
				network: network,
				connections: connections,
			});
			const JsonObj = JSON.stringify(recObj);

			socket.emit('save-network', { data: JsonObj, dateTime: `${d.getFullYear()}-${d.getMonth()}-${d.getDay()}` }, (response) => {
				let urlId = response.id.split('.')[1];
				let url = window.location.origin + '/build/' + urlId;

				setBuildNetwork({
					network: network,
					connections: connections,
					id: response.id,
					urlId: urlId,
					url: url,
					visible: true,
				});
			});
		} else {
			setBuildNetwork({
				name: '',
				network: network,
				connections: connections,
				visible: false,
			});
		}
	};

	// Check if Environment Variables Exist
	const checkEnv = () => {
		let resPromise = new Promise((resolve, reject) => {
			socket.emit('check-env', (response) => {
				setEnvVariables(response);
				resolve(response);
			});
		});
		return resPromise;
	};

	return (
		<BrowserRouter>
			<div className='App'>
				<Switch>
					<Route path='*/build' exact>
						<NavBar
							title={strings.buildNetwork}
							appData={appData}
							route='build'
							onCommand={onCommand}
							checkEnv={checkEnv}
							content={
								envVariables && (
									<>
										<button onClick={() => shareNetwork(true)}>{strings.shareNetwork}</button>
									</>
								)
							}
						/>
						<Network shareNetwork={shareNetwork} buildNetwork={buildNetwork} />
					</Route>
					<Route path='*/build/:id'>
						<NavBar
							title={strings.buildNetwork}
							appData={appData}
							route='build'
							onCommand={onCommand}
							checkEnv={checkEnv}
							content={
								envVariables && (
									<>
										<button onClick={() => shareNetwork(true)}>{strings.shareNetwork}</button>
									</>
								)
							}
						/>
						<Network
							shareNetwork={shareNetwork}
							buildNetwork={buildNetwork}
							shared={true}
							retrieveNetwork={retrieveNetwork}
							retrievedNetwork={retrievedNetwork}
							setRetrievedNetwork={setRetrievedNetwork}
							envVariables={envVariables}
						/>
					</Route>
					<Route path='*/trained'>
						<NavBar
							title={strings.pretrainedModel}
							appData={appData}
							route='trained'
							onCommand={onCommand}
							content={
								<>
									<SelectRecipe classifications={classifications} onSubmit={onFindRecipe} />
									<button onClick={onSaveRecipe} disabled={!appData.classroom || !updated}>
										{strings.saveRecipe}
									</button>
								</>
							}
						/>
						<TrainedNetwork
							onChange={onChange}
							onPrediction={onPrediction}
							inputs={recipe}
							ingredients={ingredients}
							classifications={classifications}
						/>
						<Reclassify recipe={recipe} classifications={classifications} visible={reclassify} onReclassify={onReclassify} />
					</Route>
					<Route path='*/stats'>
						<NavBar title={strings.stats} appData={appData} route='stats' onCommand={onCommand} />
						<Stats appData={appData} ingredients={ingredients} classifications={classifications} recipes={recipes} />
					</Route>
					<Route path='/'>
						<NavBar title={strings.instructions} appData={appData} route='instructions' onCommand={onCommand} />
						<Instructions />
					</Route>
				</Switch>
				<Alert />
				<Prompt />
				<SharePrompt buildNetwork={buildNetwork} onDismiss={() => setBuildNetwork({ ...buildNetwork, visible: false })} />
				<ClassroomCode code={classroomCode} appData={appData} onDismiss={() => setClassroomCode(false)} />
			</div>
		</BrowserRouter>
	);
}

export default App;
