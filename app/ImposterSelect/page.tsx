import Game from "../Components/Game";
import Title from "../Components/Title";
import Timer from "../Components/Timer";
import Message from "../Components/Message";
import PlayerList from "../Components/PlayerList";
import ImposterSelect from "../Components/ImposterSelect";
import GameGrid from "../Components/GameGrid";
import GameHeader from "../Components/GameHeader";

export default function ImposterSelectPage() {
	return (<>
		<Game>
			<Title />
			<GameGrid>
				<></>
				<GameHeader>
					<Timer /><Message />
				</GameHeader>
				<PlayerList />
				<ImposterSelect />
			</GameGrid>
		</Game>
	</>)
}

