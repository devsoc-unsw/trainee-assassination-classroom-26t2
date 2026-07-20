
import Game from "../Components/Game";
import Title from "../Components/Title";
import PlayersReady from "../Components/PlayersReady";
import Message from "../Components/Message";
import DrawingTools from "../Components/DrawingTools";
import AvatarCanvas from "../Components/AvatarCanvas";
import GameHeader from "../Components/GameHeader";
import GameGrid from "../Components/GameGrid";

export default function Home() {
	return (<>
		<Game>
			<Title />
			<GameGrid>
				<></>
				<GameHeader>
					<PlayersReady /><Message text="Draw your avatar!" />
				</GameHeader>
				<DrawingTools />
				<AvatarCanvas />
			</GameGrid>
		</Game>
	</>)
}

